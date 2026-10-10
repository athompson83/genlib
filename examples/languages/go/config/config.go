// Package config loads explicit server configuration without logging secrets.
package config
import (
 "errors"
 "net/url"
 "strconv"
 "strings"
)
type Config struct { ServiceURL string; RequestTimeout int }
func Load(values map[string]string)(Config,error){
 raw:=values["SERVICE_URL"]
 u,err:=url.Parse(raw)
 if err!=nil||u.Scheme!="https"||u.Hostname()==""||u.User!=nil||u.Fragment!=""||len(raw)>2048||strings.ContainsAny(raw,"\r\n"){return Config{},errors.New("invalid SERVICE_URL")}
 timeout:=10
 if s,ok:=values["REQUEST_TIMEOUT"];ok {
  timeout,err=strconv.Atoi(s)
  if err!=nil{return Config{},errors.New("invalid REQUEST_TIMEOUT")}
 }
 if timeout<1||timeout>60{return Config{},errors.New("REQUEST_TIMEOUT outside supported range")}
 return Config{ServiceURL:raw,RequestTimeout:timeout},nil
}
