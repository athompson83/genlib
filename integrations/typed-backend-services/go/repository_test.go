// SPDX-License-Identifier: Apache-2.0
package inventory
import (
 "context"
 "database/sql"
 _ "embed"
 "testing"
 _ "modernc.org/sqlite"
)
//go:embed schema.sql
var schema string
func TestTransactionsAndCompletion(t *testing.T){
 db,err:=sql.Open("sqlite",":memory:");if err!=nil{t.Fatal(err)};defer db.Close();db.SetMaxOpenConns(1)
 if _,err=db.Exec(schema);err!=nil{t.Fatal(err)}
 r:=New(db);ctx:=context.Background()
 if err=r.AddAll(ctx,[]NewItem{{"a"," One "},{"b","Two"}});err!=nil{t.Fatal(err)}
 if err=r.Complete(ctx,"a",true);err!=nil{t.Fatal(err)}
 rows,err:=r.List(ctx);if err!=nil||len(rows)!=2||rows[0].Title!="One"||!rows[0].Completed{t.Fatalf("unexpected rows: %+v %v",rows,err)}
 if err=r.AddAll(ctx,[]NewItem{{"c","Three"},{"d",""}});err==nil{t.Fatal("invalid batch accepted")}
 rows,_=r.List(ctx);if len(rows)!=2{t.Fatal("batch was not rolled back")}
 if err=r.Complete(ctx,"missing",true);err!=sql.ErrNoRows{t.Fatalf("missing row result: %v",err)}
 cancelled,cancel:=context.WithCancel(ctx);cancel()
 if err=r.AddAll(cancelled,[]NewItem{{"e","Cancelled"}});err==nil{t.Fatal("cancelled write succeeded")}
}
