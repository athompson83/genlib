-- name: CreateItem :one
INSERT INTO item(id, title) VALUES (?, ?) RETURNING *;

-- name: GetItem :one
SELECT * FROM item WHERE id = ?;

-- name: ListItems :many
SELECT * FROM item ORDER BY id;

-- name: SetCompleted :execrows
UPDATE item SET completed = ? WHERE id = ?;
