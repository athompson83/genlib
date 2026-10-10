package safelog
import ("bytes";"strings";"testing")
func TestWrite(t *testing.T){
 var b bytes.Buffer
 if e:=Write(&b,"started",map[string]any{"component":"api"});e!=nil||!strings.Contains(b.String(),"\"started\""){t.Fatal(e,b.String())}
 if e:=Write(&b,"started",map[string]any{"token":"secret"});e==nil{t.Fatal("secret accepted")}
}
