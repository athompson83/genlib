CREATE TABLE item (
 id text PRIMARY KEY,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 completed boolean NOT NULL DEFAULT false
);
