// Package safelog emits allowlisted JSON events; never log credentials.
package safelog
import (
 "encoding/json"
 "errors"
 "io"
 "time"
)
var allowed=map[string]bool{"component":true,"status":true,"duration_ms":true,"request_id":true}
func Write(w io.Writer,event string,fields map[string]any) error{
 if event==""||len(event)>80{return errors.New("invalid event")}
 record:=map[string]any{"timestamp":time.Now().UTC().Format(time.RFC3339Nano),"event":event}
 for k,v:=range fields{
  if !allowed[k]{return errors.New("unapproved log field")}
  switch v.(type){case string,bool,int,int64,float64,nil:default:return errors.New("unsupported field type")}
  record[k]=v
 }
 b,err:=json.Marshal(record)
 if err!=nil{return errors.New("invalid log record")}
 b=append(b,'\n')
 _,err=w.Write(b)
 return err
}
