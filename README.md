### [<sub>⬇</sub> Modify HTTP Response](https://github.com/JustOff/modify-http-response/releases)

**Modify HTTP Response** is designed to rewrite http response body using search & replace patterns.

**Warning**:

This tool works on low level API and intended for advanced users.
Incorrect filters can cause browser freeze, hang or loose data.
Never use filters from untrusted sources or if you don't understand them.

**Filters Syntax**:

```
Filters = [ Filter1, Filter2, ... ]
FilterN = [ Host, Rule1, Rule2, ... ]
RuleN = [ Path, [ Search1, Replace1, Search2, Replace2, ... ] ]
```

Host, Path, Search and Replace items must be enclosed in double quotes `"`, double quotes and backslash `\` must be escaped with backslash. When using the built-in editor, these rules will be applied automatically.

When Host, Path or Search matches to `^\/.+\/[igm]{0,3}$` it treated as regexp.

**Filter examples**:

```
[["example.com",["/",["<h1>Example Domain</h1>","<h3>Small Example Domain</h3>"]]]]
[["example.com",["/",["/Domain/gi","dOmAiN"]]]]
```

**Notes**:

- Only one Filter per Host is processed for performance reasons, use multiple Rules within Filter and multiple Search & Replace pairs within each Rule, if required
- To avoid errors use embedded filters editor
- Ctrl+Click on toolbar button calls the options
