using Genlib.Validation;
if (!IdentifierValidator.IsValid("user_1", 16)) throw new Exception("valid rejected");
foreach (var bad in new[] { "", "_bad", "a/b", "a b", "é" })
    if (IdentifierValidator.IsValid(bad, 16)) throw new Exception("invalid accepted: " + bad);
if (IdentifierValidator.IsValid("abcd", 3)) throw new Exception("limit ignored");
Console.WriteLine("Validation checks passed");
