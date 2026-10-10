// SPDX-License-Identifier: Apache-2.0
using Velopack;
namespace GenlibInventory;
public sealed class UpdateSession {
    private readonly UpdateManager manager;
    private UpdateInfo? available, pending;
    public bool Ready=>pending is not null;
    public bool Available=>available is not null && pending is null;
    public UpdateSession(Uri feed) {
        if(feed.Scheme!="https" || !string.IsNullOrEmpty(feed.UserInfo) || !string.IsNullOrEmpty(feed.Fragment) || !string.IsNullOrEmpty(feed.Query)) throw new ArgumentException("Trusted HTTPS update feed required");
        manager=new UpdateManager(feed.AbsoluteUri);
    }
    public async Task<bool> CheckAsync() {
        if(Ready)throw new InvalidOperationException("An update is already downloaded");
        available=null;
        var next=await manager.CheckForUpdatesAsync();if(next is null)return false;
        if(next.IsDowngrade)throw new InvalidOperationException("Downgrade is not allowed by this profile");
        available=next;return true;
    }
    public async Task DownloadAsync() {
        var next=available??throw new InvalidOperationException("Check for an available update first");
        available=null;await manager.DownloadUpdatesAsync(next);pending=next;
    }
    public void ApplyAndRestart() {
        if(pending is null)throw new InvalidOperationException("No verified downloaded update is ready");
        manager.ApplyUpdatesAndRestart(pending);
    }
}
