# SPDX-License-Identifier: Apache-2.0
GET {{base_url}}/items
HTTP 401
[Asserts]
jsonpath "$.code" == "UNAUTHORIZED"

POST {{base_url}}/items
Authorization: Bearer {{token}}
Content-Type: application/json
{"title":"First HTTP fixture"}
HTTP 201
[Captures]
item_id: jsonpath "$.id"
[Asserts]
jsonpath "$.completed" == false

GET {{base_url}}/items/{{item_id}}
Authorization: Bearer {{token}}
HTTP 200
[Captures]
item_etag: header "ETag"
[Asserts]
jsonpath "$.title" == "First HTTP fixture"
header "Cache-Control" == "private, max-age=0, must-revalidate"
header "Vary" == "Authorization"

GET {{base_url}}/items/{{item_id}}
Authorization: Bearer {{token}}
If-None-Match: W/{{item_etag}}
HTTP 304
[Asserts]
header "ETag" == "{{item_etag}}"
body == ""

# Conditional requests must still authenticate.
GET {{base_url}}/items/{{item_id}}
If-None-Match: {{item_etag}}
HTTP 401

POST {{base_url}}/items
Authorization: Bearer {{token}}
Content-Type: application/json
{"title":"Second HTTP fixture"}
HTTP 201

POST {{base_url}}/items
Authorization: Bearer {{token}}
Content-Type: application/json
{"title":"Third HTTP fixture"}
HTTP 201

GET {{base_url}}/items
Authorization: Bearer {{token}}
HTTP 200
[Captures]
next_cursor: jsonpath "$.nextCursor"
page_etag: header "ETag"
[Asserts]
jsonpath "$.items" count == 2
jsonpath "$.items[0].title" == "First HTTP fixture"
jsonpath "$.items[1].title" == "Second HTTP fixture"
jsonpath "$.nextCursor" == 2

GET {{base_url}}/items?cursor={{next_cursor}}
Authorization: Bearer {{token}}
HTTP 200
[Captures]
last_etag: header "ETag"
[Asserts]
jsonpath "$.items" count == 1
jsonpath "$.items[0].title" == "Third HTTP fixture"
jsonpath "$.nextCursor" not exists

GET {{base_url}}/items
Authorization: Bearer {{token}}
If-None-Match: {{page_etag}}
HTTP 304
[Asserts]
body == ""

POST {{base_url}}/items
Authorization: Bearer {{token}}
Content-Type: application/json
{"title":"Fourth HTTP fixture"}
HTTP 201

GET {{base_url}}/items?cursor={{next_cursor}}
Authorization: Bearer {{token}}
If-None-Match: {{last_etag}}
HTTP 200
[Asserts]
jsonpath "$.items" count == 2
jsonpath "$.items[1].title" == "Fourth HTTP fixture"
header "ETag" != "{{last_etag}}"

GET {{base_url}}/items?cursor=-1
Authorization: Bearer {{token}}
HTTP 400
[Asserts]
jsonpath "$.code" == "INVALID_CURSOR"

# Original local chunk-upload fixture protocol; production resumable uploads use the tus pack.
POST {{base_url}}/uploads
Content-Type: application/json
{"filename":"hello.txt","length":11}
HTTP 401

POST {{base_url}}/uploads
Authorization: Bearer {{token}}
Content-Type: application/json
{"filename":"hello.txt","length":11}
HTTP 201
[Captures]
upload_id: jsonpath "$.id"
[Asserts]
jsonpath "$.offset" == 0
jsonpath "$.completed" == false
header "Upload-Offset" == "0"

POST {{base_url}}/uploads/{{upload_id}}/complete
Authorization: Bearer {{token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "INCOMPLETE_UPLOAD"

PATCH {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{token}}
Content-Type: application/octet-stream
Upload-Offset: 0
hex,48656c6c6f20;
HTTP 204
[Asserts]
header "Upload-Offset" == "6"

# Resume from server offset after a client interruption.
HEAD {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{token}}
HTTP 200
[Asserts]
header "Upload-Offset" == "6"
header "Upload-Length" == "11"

PATCH {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{token}}
Content-Type: application/octet-stream
Upload-Offset: 0
hex,48656c6c6f20;
HTTP 409
[Asserts]
jsonpath "$.code" == "OFFSET_CONFLICT"

PATCH {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{token}}
Content-Type: application/octet-stream
Upload-Offset: 6
hex,776f726c64;
HTTP 204
[Asserts]
header "Upload-Offset" == "11"

POST {{base_url}}/uploads/{{upload_id}}/complete
Authorization: Bearer {{token}}
HTTP 200
[Captures]
completed_id: jsonpath "$.id"
[Asserts]
jsonpath "$.completed" == true
jsonpath "$.offset" == 11
jsonpath "$.sha256" == "64ec88ca00b268e5ba1a35678a1b5316d212f4f366b2477232534a8aeca37f3c"

# Completion is idempotent; a second call retains the same object identity and bytes.
POST {{base_url}}/uploads/{{upload_id}}/complete
Authorization: Bearer {{token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{completed_id}}"
jsonpath "$.sha256" == "64ec88ca00b268e5ba1a35678a1b5316d212f4f366b2477232534a8aeca37f3c"
