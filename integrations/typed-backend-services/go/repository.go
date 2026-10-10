// SPDX-License-Identifier: Apache-2.0
package inventory
import (
 "context"
 "database/sql"
 "errors"
 "strings"
 "unicode/utf8"
 "dev.genlib/inventory-sqlc/internal/dbgen"
)
type NewItem struct {ID string; Title string}
type Repository struct {db *sql.DB; queries *dbgen.Queries}
func New(db *sql.DB)*Repository{return &Repository{db:db,queries:dbgen.New(db)}}
func(r *Repository) List(ctx context.Context)([]dbgen.Item,error){return r.queries.ListItems(ctx)}
func(r *Repository) AddAll(ctx context.Context,items []NewItem)error{
 tx,err:=r.db.BeginTx(ctx,nil);if err!=nil{return err};defer tx.Rollback()
 q:=r.queries.WithTx(tx)
 for _,item:=range items{
  title:=strings.TrimSpace(item.Title)
  if item.ID==""||len(item.ID)>64||utf8.RuneCountInString(title)<1||utf8.RuneCountInString(title)>200{return errors.New("invalid item")}
  if _,err:=q.CreateItem(ctx,dbgen.CreateItemParams{ID:item.ID,Title:title});err!=nil{return err}
 }
 return tx.Commit()
}
func(r *Repository) Complete(ctx context.Context,id string,completed bool)error{
 changed,err:=r.queries.SetCompleted(ctx,dbgen.SetCompletedParams{ID:id,Completed:completed})
 if err!=nil{return err};if changed==0{return sql.ErrNoRows};return nil
}
