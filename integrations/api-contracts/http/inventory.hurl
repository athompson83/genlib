# SPDX-License-Identifier: Apache-2.0
GET {{base_url}}/items
HTTP 401
[Asserts]
jsonpath "$.code" == "UNAUTHORIZED"

POST {{base_url}}/items
Authorization: Bearer {{token}}
Content-Type: application/json
{"title":"HTTP fixture"}
HTTP 201
[Captures]
item_id: jsonpath "$.id"
[Asserts]
jsonpath "$.completed" == false

GET {{base_url}}/items/{{item_id}}
Authorization: Bearer {{token}}
HTTP 200
[Asserts]
jsonpath "$.title" == "HTTP fixture"

GET {{base_url}}/items?cursor=-1
Authorization: Bearer {{token}}
HTTP 400
[Asserts]
jsonpath "$.code" == "INVALID_CURSOR"
