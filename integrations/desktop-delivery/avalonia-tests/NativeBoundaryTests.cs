// SPDX-License-Identifier: Apache-2.0
using GenlibInventory;
using Xunit;
namespace GenlibInventory.Tests;
public class NativeBoundaryTests {
    [Fact] public void SelectedTextUsesOnlyLeafNameAndStrictUtf8() {
        Assert.Equal("Hello",TextSelection.Decode("fixture.md",System.Text.Encoding.UTF8.GetBytes("Hello")).Contents);
        foreach(var name in new[]{"../a.txt","path\\a.md","a.exe"})Assert.Throws<ArgumentException>(()=>TextSelection.Decode(name,[65]));
        Assert.Throws<System.Text.DecoderFallbackException>(()=>TextSelection.Decode("a.txt",[255]));
        Assert.Throws<ArgumentException>(()=>TextSelection.Decode("a.txt",[0]));
        Assert.Throws<ArgumentException>(()=>TextSelection.Decode("a.txt",new byte[TextSelection.MaximumBytes+1]));
    }
    [Fact] public void SessionTokensAreBoundedBeforeNativeCalls() {
        Assert.Equal("fixture-token",SessionVault.Validate("fixture-token"));
        foreach(var token in new[]{"","line\nbreak",new string('x',2049)})Assert.Throws<ArgumentException>(()=>SessionVault.Validate(token));
    }
    [Fact] public void UpdatesRejectInsecureOrCredentialBearingFeeds() {
        foreach(var feed in new[]{"http://example.invalid/","https://user:pass@example.invalid/","https://example.invalid/?secret=x","https://example.invalid/#fragment"})
            Assert.Throws<ArgumentException>(()=>new UpdateSession(new Uri(feed)));
    }
}
