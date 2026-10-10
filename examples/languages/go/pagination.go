package pagination

import (
 "errors"
 "strconv"
)

var ErrInvalidPage = errors.New("invalid page request")

type Page[T any] struct {
 Items []T
 NextCursor string
}

func Paginate[T any](items []T, limit int, cursor string) (Page[T], error) {
 if limit < 1 || limit > 100 { return Page[T]{}, ErrInvalidPage }
 offset:=0
 if cursor!="" {
  for _,r:=range cursor {if r<'0'||r>'9'{return Page[T]{},ErrInvalidPage}}
  parsed,err:=strconv.Atoi(cursor)
  if err!=nil||parsed<0||parsed>1000000{return Page[T]{},ErrInvalidPage}
  offset=parsed
 }
 if offset>len(items){offset=len(items)}
 end:=offset+limit
 if end>len(items){end=len(items)}
 result:=Page[T]{Items:append([]T(nil),items[offset:end]...)}
 if end<len(items){result.NextCursor=strconv.Itoa(end)}
 return result,nil
}
