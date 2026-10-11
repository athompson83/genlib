CREATE TABLE item (
 id TEXT NOT NULL PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 completed INTEGER NOT NULL DEFAULT 0
);
INSERT INTO item(id, title) VALUES ('legacy', 'Keep me');
