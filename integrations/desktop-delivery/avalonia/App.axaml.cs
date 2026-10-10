// SPDX-License-Identifier: Apache-2.0
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
namespace GenlibInventory;
public partial class App : Application {
    public override void Initialize() => AvaloniaXamlLoader.Load(this);
    public override void OnFrameworkInitializationCompleted() {
        if(ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop) desktop.MainWindow=new MainWindow();
        base.OnFrameworkInitializationCompleted();
    }
}
