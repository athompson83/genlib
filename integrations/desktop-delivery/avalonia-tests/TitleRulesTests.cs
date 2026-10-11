// SPDX-License-Identifier: Apache-2.0
using GenlibInventory;
using Xunit;
public class TitleRulesTests {
    [Fact] public void NormalizesAndRejectsInvalidTitles() {
        Assert.Equal("Label",TitleRules.Normalize(" Label "));
        Assert.Throws<ArgumentException>(()=>TitleRules.Normalize(" "));
        Assert.Throws<ArgumentException>(()=>TitleRules.Normalize(new string('x',201)));
    }
    [Fact] public void RejectsUntrustedUpdateFeed() {
        Assert.Throws<ArgumentException>(()=>new UpdateSession(new Uri("http://updates.example.test")));
    }
}
