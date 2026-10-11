import "@typespec/http";
import "@typespec/openapi3";
using TypeSpec.Http;
@service(#{ title: "Genlib contract-authoring variant" })
@server("http://127.0.0.1:4317", "Local fixture")
namespace Genlib.Inventory;
model Item { id: string; title: string; completed: boolean; }
@route("/items") @get op list(): { items: Item[]; };
