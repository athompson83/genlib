package httpclient

import (
 "context"
 "io"
 "net/http"
 "strings"
 "testing"
)
type transport func(*http.Request)(*http.Response,error)
func (f transport) RoundTrip(r *http.Request)(*http.Response,error){return f(r)}
func TestGetJSON(t *testing.T){
 client:=Client{HTTP:&http.Client{Transport:transport(func(r *http.Request)(*http.Response,error){
  if r.URL.Host!="example.org"{t.Fatal(r.URL)}
  return &http.Response{StatusCode:200,Body:io.NopCloser(strings.NewReader(`{"ok":true}`)),Header:make(http.Header)},nil
 })}}
 var result struct{Ok bool `json:"ok"`}
 if err:=client.GetJSON(context.Background(),"https://example.org/data",&result);err!=nil||!result.Ok{t.Fatal(err,result)}
 for _,u:=range []string{"http://example.org","https://user:pass@example.org"}{
  if err:=client.GetJSON(context.Background(),u,&result);err==nil{t.Fatal("accepted",u)}
 }
 client.MaxBytes=2
 if err:=client.GetJSON(context.Background(),"https://example.org/data",&result);err==nil{t.Fatal("size limit bypass")}
}
