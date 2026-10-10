package pagination

import "testing"

func TestPaginate(t *testing.T){
 first,err:=Paginate([]int{1,2,3},2,"")
 if err!=nil||len(first.Items)!=2||first.NextCursor!="2"{t.Fatal(first,err)}
 second,err:=Paginate([]int{1,2,3},2,first.NextCursor)
 if err!=nil||len(second.Items)!=1||second.NextCursor!=""{t.Fatal(second,err)}
 for _,c:=range []string{"-1","2.1","abc","9999999999"}{
  if _,err:=Paginate([]int{1},1,c);err==nil{t.Fatal("accepted",c)}
 }
}
