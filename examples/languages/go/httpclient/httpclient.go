// Package httpclient provides a bounded JSON GET helper for trusted servers.
package httpclient

import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/http"
 "net/url"
 "time"
)

type Client struct {
 HTTP *http.Client
 MaxBytes int64
}
func (c Client) GetJSON(ctx context.Context, rawURL string, out any) error {
 u,err:=url.Parse(rawURL)
 if err!=nil||u.Scheme!="https"||u.Hostname()==""||u.User!=nil||u.Fragment!="" {return errors.New("HTTPS URL without credentials required")}
 max:=c.MaxBytes
 if max==0 {max=1_000_000}
 if max<1||max>5_000_000{return errors.New("invalid response bound")}
 client:=c.HTTP
 if client==nil {
  client=&http.Client{Timeout:10*time.Second,CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}
 }
 req,err:=http.NewRequestWithContext(ctx,http.MethodGet,rawURL,nil)
 if err!=nil{return err}
 req.Header.Set("Accept","application/json")
 resp,err:=client.Do(req)
 if err!=nil{return err}
 defer resp.Body.Close()
 if resp.StatusCode<200||resp.StatusCode>=300{return fmt.Errorf("upstream request failed: status %d",resp.StatusCode)}
 data,err:=io.ReadAll(io.LimitReader(resp.Body,max+1))
 if err!=nil{return err}
 if int64(len(data))>max{return errors.New("response exceeds maximum size")}
 if err:=json.Unmarshal(data,out);err!=nil{return errors.New("invalid JSON response")}
 return nil
}
