// SPDX-License-Identifier: Apache-2.0
package main
import ("strings";"testing")
func TestNormalizeTitle(t *testing.T){
 app:=&App{}
 got,err:=app.NormalizeTitle("  Label  ");if err!=nil||got!="Label"{t.Fatalf("normalization failed: %q %v",got,err)}
 for _,input:=range []string{" ",strings.Repeat("界",201)}{if _,err:=app.NormalizeTitle(input);err==nil{t.Fatal("invalid title accepted")}}
}
