// SPDX-License-Identifier: Apache-2.0
using Avalonia.Controls;
using Avalonia.Markup.Xaml;
namespace GenlibInventory;
public partial class MainWindow : Window {
    private readonly UpdateSession? updates;
    public MainWindow() {
        AvaloniaXamlLoader.Load(this);
        this.FindControl<Button>("NormalizeButton")!.Click += (_,_) => {
            try { this.FindControl<TextBlock>("Result")!.Text=TitleRules.Normalize(this.FindControl<TextBox>("TitleInput")!.Text ?? ""); }
            catch(ArgumentException) { this.FindControl<TextBlock>("Result")!.Text="Enter a title of 1 to 200 characters."; }
        };
        var feed=Environment.GetEnvironmentVariable("GENLIB_UPDATE_FEED");
        if(Uri.TryCreate(feed,UriKind.Absolute,out var uri) && uri.Scheme=="https" && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Fragment)) updates=new UpdateSession(uri);
        var update=this.FindControl<Button>("UpdateButton")!;
        update.IsEnabled=updates is not null;
        update.Click += async (_,_) => {
            update.IsEnabled=false;
            var status=this.FindControl<TextBlock>("UpdateStatus")!;
            try {
                if(updates!.Ready) { updates.ApplyAndRestart(); return; }
                if(await updates.CheckAndDownloadAsync()) {
                    status.Text="Update downloaded. Save your work before restarting.";
                    update.Content="Restart to update";
                } else status.Text="You are up to date.";
            } catch { status.Text="Updates are unavailable. Try again later."; }
            finally { update.IsEnabled=true; }
        };
    }
}
