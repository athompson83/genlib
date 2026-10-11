// SPDX-License-Identifier: Apache-2.0
using System.Text;
using Avalonia.Controls;
using Avalonia.Platform.Storage;
namespace GenlibInventory;
public sealed record SelectedText(string Name,string Contents);
public static class TextSelection {
    public const int MaximumBytes=256*1024;
    public static SelectedText Decode(string name,byte[] bytes) {
        if(name.Length>200 || Path.GetFileName(name)!=name || name.IndexOfAny(['\\','/','\0'])>=0 ||
          !new[]{".txt",".md",".json"}.Contains(Path.GetExtension(name),StringComparer.OrdinalIgnoreCase)) throw new ArgumentException("Unsupported text file");
        if(bytes.Length>MaximumBytes) throw new ArgumentException("File exceeds 256 KiB");
        var contents=new UTF8Encoding(false,true).GetString(bytes);
        if(contents.Contains('\0')) throw new ArgumentException("Binary files are not supported");
        return new(name,contents);
    }
    public static async Task<SelectedText?> PickAsync(TopLevel owner) {
        var files=await owner.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions {
            Title="Choose a text fixture",AllowMultiple=false,
            FileTypeFilter=[new FilePickerFileType("Text fixtures"){Patterns=["*.txt","*.md","*.json"]}]
        });
        if(files.Count==0)return null;
        if(files.Count!=1)throw new InvalidOperationException("Choose one file");
        using var file=files[0];await using var source=await file.OpenReadAsync();
        using var buffer=new MemoryStream();var chunk=new byte[8192];
        while(true){var read=await source.ReadAsync(chunk);if(read==0)break;
            if(buffer.Length+read>MaximumBytes)throw new ArgumentException("File exceeds 256 KiB");
            buffer.Write(chunk,0,read);
        }
        return Decode(file.Name,buffer.ToArray());
    }
}
