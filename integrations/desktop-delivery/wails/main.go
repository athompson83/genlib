// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"embed"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"log"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	native := &desktopNative{delivery: configuredDelivery()}
	app := &App{native: native}
	err := wails.Run(&options.App{Title: "Genlib Inventory", Width: 780, Height: 800,
		AssetServer: &assetserver.Options{Assets: assets}, OnStartup: func(ctx context.Context) { native.ctx = ctx }, Bind: []interface{}{app}})
	if err != nil {
		log.Fatal(err)
	}
}
