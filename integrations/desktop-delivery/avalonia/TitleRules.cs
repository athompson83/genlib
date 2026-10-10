// SPDX-License-Identifier: Apache-2.0
using System.Text;
namespace GenlibInventory;
public static class TitleRules {
    public static string Normalize(string value) {
        var title=value.Trim();var count=title.EnumerateRunes().Count();
        if(count<1||count>200) throw new ArgumentException("Title must contain 1 to 200 characters",nameof(value));
        return title;
    }
}
