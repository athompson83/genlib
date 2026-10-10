// SPDX-License-Identifier: Apache-2.0
using Avalonia.Controls;
using Avalonia.Markup.Xaml;
namespace GenlibInventory;
public partial class MainWindow : Window {
    private readonly UpdateSession? updates;
    private SessionVault? vault;
    private T Element<T>(string name) where T:Control=>this.FindControl<T>(name)!;
    public MainWindow() {
        AvaloniaXamlLoader.Load(this);
        Element<Button>("NormalizeButton").Click+=(_,_)=>{
            try{Element<TextBlock>("Result").Text=TitleRules.Normalize(Element<TextBox>("TitleInput").Text??"");}
            catch(ArgumentException){Element<TextBlock>("Result").Text="Enter a title of 1 to 200 characters.";}
        };
        Element<Button>("PickFile").Click+=async(_,_)=>{
            var button=Element<Button>("PickFile");button.IsEnabled=false;
            try{var file=await TextSelection.PickAsync(this);Element<TextBlock>("FileStatus").Text=file is null?"Selection cancelled":"Selected "+file.Name;Element<TextBox>("FilePreview").Text=file?.Contents??"";}
            catch{Element<TextBlock>("FileStatus").Text="Choose a supported text file of at most 256 KiB.";}
            finally{button.IsEnabled=true;}
        };
        Element<Button>("SaveSession").Click+=async(_,_)=>{
            var token=Element<TextBox>("SessionToken").Text??"";Element<TextBox>("SessionToken").Text="";
            try{await (vault??=new SessionVault()).SaveAsync(token);Element<TextBlock>("VaultStatus").Text="A session is saved in OS secure storage.";}
            catch{Element<TextBlock>("VaultStatus").Text="OS secure storage is unavailable or the token is invalid.";}
        };
        Element<Button>("SessionStatus").Click+=async(_,_)=>{
            try{Element<TextBlock>("VaultStatus").Text=await (vault??=new SessionVault()).HasSessionAsync()?"A session is saved in OS secure storage.":"No session is saved.";}
            catch{Element<TextBlock>("VaultStatus").Text="OS secure storage is unavailable.";}
        };
        Element<Button>("ClearSession").Click+=async(_,_)=>{
            try{await (vault??=new SessionVault()).ClearAsync();Element<TextBlock>("VaultStatus").Text="No session is saved.";}
            catch{Element<TextBlock>("VaultStatus").Text="OS secure storage is unavailable.";}
        };
        var feed=System.Reflection.Assembly.GetExecutingAssembly().GetCustomAttributes(typeof(System.Reflection.AssemblyMetadataAttribute),false)
            .Cast<System.Reflection.AssemblyMetadataAttribute>().FirstOrDefault(attribute=>attribute.Key=="GenlibUpdateFeed")?.Value
            ?? Environment.GetEnvironmentVariable("GENLIB_UPDATE_FEED");
        if(Uri.TryCreate(feed,UriKind.Absolute,out var uri))try{updates=new UpdateSession(uri);}catch(ArgumentException){}
        var check=Element<Button>("CheckUpdate");
        var download=Element<Button>("DownloadUpdate");
        var restart=Element<Button>("RestartUpdate");
        check.IsEnabled=updates is not null;
        check.Click+=async(_,_)=>{check.IsEnabled=false;download.IsEnabled=false;
            try{var found=await updates!.CheckAsync();download.IsEnabled=found;Element<TextBlock>("UpdateStatus").Text=found?"An update is available. Download it when ready.":"You are up to date.";}
            catch{Element<TextBlock>("UpdateStatus").Text="Update check failed.";}finally{check.IsEnabled=true;}};
        download.Click+=async(_,_)=>{download.IsEnabled=false;check.IsEnabled=false;
            try{await updates!.DownloadAsync();restart.IsEnabled=true;Element<TextBlock>("UpdateStatus").Text="Update verified. Save your work, then install and restart.";}
            catch{Element<TextBlock>("UpdateStatus").Text="Update download failed.";check.IsEnabled=true;}};
        restart.Click+=(_,_)=>{restart.IsEnabled=false;try{updates!.ApplyAndRestart();}catch{Element<TextBlock>("UpdateStatus").Text="Update restart failed. You can retry installing the verified download.";restart.IsEnabled=updates?.Ready==true;check.IsEnabled=updates?.Ready!=true;}};
    }
}
