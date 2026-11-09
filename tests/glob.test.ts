import assert from "node:assert/strict";
import { test } from "node:test";
import { globToRegex } from "../src/glob.ts";
import type { GlobOptions } from "../src/types.ts";

function match(glob: string, path: string, opts: GlobOptions = {}): boolean {
  const { regex } = globToRegex(glob, opts);
  return regex.test(path);
}

test("Standard * matching", () => {
  assert.equal(match("*", "foo"), true);
  assert.equal(match("f*", "foo"), true);
  assert.equal(match("*o", "foo"), true);
  assert.equal(match("f*uck", "firetruck"), true);
  assert.equal(match("uc", "firetruck"), false);
  assert.equal(match("f*uck", "fuck"), true);
});

test("Advanced * matching", () => {
  assert.equal(match("*.min.js", "http://example.com/jquery.min.js", { globstar: false }), true);
  assert.equal(match("*.min.*", "http://example.com/jquery.min.js", { globstar: false }), true);
  assert.equal(
    match("*/js/*.js", "http://example.com/js/jquery.min.js", { globstar: false }),
    true,
  );
  assert.equal(match("*.min.js", "http://example.com/jquery.min.js"), true);
  assert.equal(match("*.min.*", "http://example.com/jquery.min.js"), true);
  assert.equal(match("*/js/*.js", "http://example.com/js/jquery.min.js"), true);

  const str = "\\/$^+?.()=!|{},[].*";
  assert.equal(match(str, str), true);

  assert.equal(match(".min.", "http://example.com/jquery.min.js"), false);
  assert.equal(match("http:", "http://example.com/jquery.min.js"), false);
  assert.equal(match("http:*", "http://example.com/jquery.min.js"), true);
  assert.equal(match("min.js", "http://example.com/jquery.min.js"), false);
  assert.equal(match("/js*jq*.js", "http://example.com/js/jquery.min.js"), false);
});

test("? matches one character", () => {
  assert.equal(match("f?o", "foo", { extended: true }), true);
  assert.equal(match("f?o", "fooo", { extended: true }), false);
  assert.equal(match("f?oo", "foo", { extended: true }), false);

  for (const globstar of [true, false]) {
    assert.equal(match("f?o", "foo", { extended: true, globstar, flags: "g" }), true);
    assert.equal(match("f?o", "fooo", { extended: true, globstar, flags: "g" }), true);
    assert.equal(match("f?o?", "fooo", { extended: true, globstar, flags: "g" }), true);
    assert.equal(match("?fo", "fooo", { extended: true, globstar, flags: "g" }), false);
    assert.equal(match("f?oo", "foo", { extended: true, globstar, flags: "g" }), false);
    assert.equal(match("foo?", "foo", { extended: true, globstar, flags: "g" }), false);
  }
});

test("[] matches character ranges", () => {
  assert.equal(match("fo[oz]", "foo", { extended: true }), true);
  assert.equal(match("fo[oz]", "foz", { extended: true }), true);
  assert.equal(match("fo[oz]", "fog", { extended: true }), false);
  assert.equal(match("fo[a-z]", "fob", { extended: true }), true);
  assert.equal(match("fo[a-d]", "fot", { extended: true }), false);
  assert.equal(match("fo[!tz]", "fot", { extended: true }), false);
  assert.equal(match("fo[!tz]", "fob", { extended: true }), true);
});

test("[] extended POSIX character ranges", () => {
  assert.equal(match("[[:alnum:]]/bar.txt", "a/bar.txt", { extended: true }), true);
  assert.equal(match("@([[:alnum:]abc]|11)/bar.txt", "11/bar.txt", { extended: true }), true);
  assert.equal(match("@([[:alnum:]abc]|11)/bar.txt", "a/bar.txt", { extended: true }), true);
  assert.equal(match("@([[:alnum:]abc]|11)/bar.txt", "b/bar.txt", { extended: true }), true);
  assert.equal(match("@([[:alnum:]abc]|11)/bar.txt", "c/bar.txt", { extended: true }), true);
  assert.equal(match("@([[:alnum:]abc]|11)/bar.txt", "abc/bar.txt", { extended: true }), false);
  assert.equal(match("@([[:alnum:]abc]|11)/bar.txt", "3/bar.txt", { extended: true }), true);
  assert.equal(match("[[:digit:]]/bar.txt", "1/bar.txt", { extended: true }), true);
  assert.equal(match("[[:digit:]b]/bar.txt", "b/bar.txt", { extended: true }), true);
  assert.equal(match("[![:digit:]b]/bar.txt", "a/bar.txt", { extended: true }), true);
  assert.equal(match("[[:alnum:]]/bar.txt", "!/bar.txt", { extended: true }), false);
  assert.equal(match("[[:digit:]]/bar.txt", "a/bar.txt", { extended: true }), false);
  assert.equal(match("[[:space:]b]/bar.txt", "a/bar.txt", { extended: true }), false);
});

test("{} matches choice of substrings", () => {
  assert.equal(match("foo{bar,baaz}", "foobaaz", { extended: true }), true);
  assert.equal(match("foo{bar,baaz}", "foobar", { extended: true }), true);
  assert.equal(match("foo{bar,baaz}", "foobuzz", { extended: true }), false);
  assert.equal(match("foo{bar,b*z}", "foobuzz", { extended: true }), true);
});

test("Globstar matching", () => {
  assert.equal(match("/foo/*", "/foo/bar.txt", { globstar: true }), true);
  assert.equal(match("/foo/**", "/foo/bar.txt", { globstar: true }), true);
  assert.equal(match("/foo/**", "/foo/bar/baz.txt", { globstar: true }), true);
  assert.equal(match("/foo/*/*.txt", "/foo/bar/baz.txt", { globstar: true }), true);
  assert.equal(match("/foo/**/*.txt", "/foo/bar/baz.txt", { globstar: true }), true);
  assert.equal(match("/foo/**/*.txt", "/foo/bar/baz/qux.txt", { globstar: true }), true);
  assert.equal(match("/foo/**/bar.txt", "/foo/bar.txt", { globstar: true }), true);
  assert.equal(match("/foo/**/**/bar.txt", "/foo/bar.txt", { globstar: true }), true);
  assert.equal(match("/foo/**/*/baz.txt", "/foo/bar/baz.txt", { globstar: true }), true);
  assert.equal(match("/foo/**/*.txt", "/foo/bar.txt", { globstar: true }), true);
  assert.equal(match("**/*.txt", "/foo/bar/baz/qux.txt", { globstar: true }), true);
  assert.equal(match("**/foo.txt", "foo.txt", { globstar: true }), true);
  assert.equal(match("**/*.txt", "foo.txt", { globstar: true }), true);
  assert.equal(match("/foo/*", "/foo/bar/baz.txt", { globstar: true }), false);
  assert.equal(match("/foo/*.txt", "/foo/bar/baz.txt", { globstar: true }), false);
  assert.equal(match("/foo/*/*.txt", "/foo/bar/baz/qux.txt", { globstar: true }), false);
  assert.equal(match("/foo/*/bar.txt", "/foo/bar.txt", { globstar: true }), false);
  assert.equal(match("/foo/**.txt", "/foo/bar/baz/qux.txt", { globstar: true }), false);
  assert.equal(match("/foo/bar**/*.txt", "/foo/bar/baz/qux.txt", { globstar: true }), false);
  assert.equal(match("/foo/bar**", "/foo/bar/baz.txt", { globstar: true }), false);
  assert.equal(match("**/.txt", "/foo/bar/baz/qux.txt", { globstar: true }), false);
  assert.equal(match("*/*.txt", "/foo/bar/baz/qux.txt", { globstar: true }), false);
  assert.equal(match("*/*.txt", "foo.txt", { globstar: true }), false);
});

test("Extended extglob ?, *, +, @, !", () => {
  assert.equal(match("(foo).txt", "(foo).txt", { extended: true }), true);
  assert.equal(match("?(foo).txt", "foo.txt", { extended: true }), true);
  assert.equal(match("?(foo).txt", ".txt", { extended: true }), true);
  assert.equal(match("?(foo|bar)baz.txt", "foobaz.txt", { extended: true }), true);
  assert.equal(match("?(ba?(z|?(r))|qux)baz.txt", "bazbaz.txt", { extended: true }), true);
  assert.equal(match("?(foo).txt", "foo.txt", { extended: false }), false);

  assert.equal(match("*(foo).txt", "foo.txt", { extended: true }), true);
  assert.equal(match("*foo.txt", "bofoo.txt", { extended: true }), true);
  assert.equal(match("*(foo).txt", "foofoo.txt", { extended: true }), true);
  assert.equal(match("*(foo).txt", ".txt", { extended: true }), true);
  assert.equal(match("*(*).txt", "whatever.txt", { extended: true, globstar: true }), true);

  assert.equal(match("+(foo).txt", "foo.txt", { extended: true }), true);
  assert.equal(match("+foo.txt", "+foo.txt", { extended: true }), true);
  assert.equal(match("+(foo).txt", ".txt", { extended: true }), false);

  assert.equal(match("@(foo).txt", "foo.txt", { extended: true }), true);
  assert.equal(match("@foo.txt", "@foo.txt", { extended: true }), true);
  assert.equal(match("@(foo|baz)bar.txt", "foobar.txt", { extended: true }), true);
  assert.equal(match("@(foo|baz)bar.txt", "foobazbar.txt", { extended: true }), false);

  assert.equal(match("!(boo).txt", "foo.txt", { extended: true }), true);
  assert.equal(match("!(foo|baz)bar.txt", "buzbar.txt", { extended: true }), true);
  assert.equal(match("!bar.txt", "!bar.txt", { extended: true }), true);
  assert.equal(match("!({foo,bar})baz.txt", "notbaz.txt", { extended: true }), true);
  assert.equal(match("!({foo,bar})baz.txt", "foobaz.txt", { extended: true }), false);
});
