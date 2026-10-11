// SPDX-License-Identifier: Apache-2.0
using System.Text;
using ktsu.CredentialCache;
using ktsu.CredentialCache.Storage;
using ktsu.Semantics.Strings;
namespace GenlibInventory;
public sealed class SessionVault {
    private static readonly PersonaGUID Persona = SemanticString<PersonaGUID>.Create("096fb601-7e17-4941-9351-f5e8546a78ae");
    private readonly ICredentialStore store;
    private readonly SemaphoreSlim gate = new(1, 1);
    public SessionVault() : this(CredentialStoreFactory.CreateDefault("dev.genlib.inventory")) { }
    // Injection is for a receiving host/test; the UI cannot choose a store or key.
    public SessionVault(ICredentialStore store) => this.store = store;
    public static string Validate(string value) {
        if(string.IsNullOrEmpty(value) || Encoding.UTF8.GetByteCount(value)>2048 || value.IndexOfAny(['\r','\n','\0'])>=0)
            throw new ArgumentException("A single-line token of at most 2048 UTF-8 bytes is required");
        return value;
    }
    public async Task SaveAsync(string value) {
        Validate(value); await gate.WaitAsync();
        try { await Task.Run(()=>store.Save(Persona,new CredentialWithToken { Token=SemanticString<CredentialToken>.Create(value) })); }
        catch { throw new InvalidOperationException("OS secure storage is unavailable"); }
        finally { gate.Release(); }
    }
    public async Task<bool> HasSessionAsync() {
        await gate.WaitAsync();
        try { return await Task.Run(()=>store.TryLoad(Persona,out var credential) && credential is CredentialWithToken); }
        catch { throw new InvalidOperationException("OS secure storage is unavailable"); }
        finally { gate.Release(); }
    }
    public async Task ClearAsync() {
        await gate.WaitAsync();
        try { await Task.Run(()=>store.Remove(Persona)); }
        catch { throw new InvalidOperationException("OS secure storage is unavailable"); }
        finally { gate.Release(); }
    }
}
