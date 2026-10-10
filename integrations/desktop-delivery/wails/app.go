// SPDX-License-Identifier: Apache-2.0
package main
import (
 "errors"
 "strings"
 "unicode/utf8"
)
type App struct{}
func (a *App) NormalizeTitle(value string) (string,error) {
 title:=strings.TrimSpace(value)
 if utf8.RuneCountInString(title)<1 || utf8.RuneCountInString(title)>200 { return "",errors.New("title must contain 1 to 200 characters") }
 return title,nil
}
