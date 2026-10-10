// SPDX-License-Identifier: Apache-2.0
using Velopack;
namespace GenlibInventory;
public sealed class UpdateSession {
    private readonly UpdateManager manager;
    private UpdateInfo? pending;
    public bool Ready => pending is not null;
    public UpdateSession(Uri feed) {
        if(feed.Scheme!="https" || !string.IsNullOrEmpty(feed.UserInfo) || !string.IsNullOrEmpty(feed.Fragment)) throw new ArgumentException("Trusted HTTPS update feed required");
        manager=new UpdateManager(feed.AbsoluteUri);
    }
    public async Task<bool> CheckAndDownloadAsync() {
        pending=null;
        var next=await manager.CheckForUpdatesAsync();if(next is null) return false;
        await manager.DownloadUpdatesAsync(next);
        pending=next;return true;
    }
    // Call only after the user has saved work and explicitly requested restart.
    public void ApplyAndRestart() {
        if(pending is null) throw new InvalidOperationException("No verified downloaded update is ready");
        manager.ApplyUpdatesAndRestart(pending);
    }
}
