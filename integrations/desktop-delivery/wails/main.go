// SPDX-License-Identifier: Apache-2.0
package main
import (
 "embed"
 "log"
 "github.com/wailsapp/wails/v2"
 "github.com/wailsapp/wails/v2/pkg/options"
 "github.com/wailsapp/wails/v2/pkg/options/assetserver"
)
//go:embed all:frontend/dist
var assets embed.FS
func main() {
 err:=wails.Run(&options.App{Title:"Inventory label",Width:640,Height:460,
  AssetServer:&assetserver.Options{Assets:assets},Bind:[]interface{}{&App{}}})
 if err!=nil {log.Fatal(err)}
}
