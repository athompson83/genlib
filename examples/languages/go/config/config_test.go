package config
import "testing"
func TestLoad(t *testing.T){
 v,e:=Load(map[string]string{"SERVICE_URL":"https://example.org/api","REQUEST_TIMEOUT":"5"})
 if e!=nil||v.RequestTimeout!=5{t.Fatal(v,e)}
 for _,u:=range []string{"http://example.org","https://a:b@example.org","https://example.org/#frag",""}{
  if _,e:=Load(map[string]string{"SERVICE_URL":u});e==nil{t.Fatal("accepted",u)}
 }
}
