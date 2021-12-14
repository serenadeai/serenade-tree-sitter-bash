const SPECIAL_CHARACTERS = [
  "'",
  '"',
  "<",
  ">",
  "{",
  "}",
  "\\[",
  "\\]",
  "(",
  ")",
  "`",
  "$",
  "|",
  "&",
  ";",
  "\\",
  "\\s",
  "#",
];

module.exports = grammar({
  name: "bash",

  inline: ($) => [
    $._terminator,
    $._literal,
    $._statements2,
    $._simple_variable_name,
    $._special_variable_name,
  ],

  externals: ($) => [
    $.heredoc_start,
    $._simple_heredoc_body,
    $._heredoc_body_beginning,
    $._heredoc_body_middle,
    $._heredoc_body_end,
    $.file_descriptor,
    $._empty_value,
    $._concat,
    $.variable_name, // Variable name followed by an operator like '=' or '+='
    $.regex,
    "}",
    "]",
    "<<",
    "<<-",
    "\n",
  ],

  extras: ($) => [$.comment, /\\?\s/],

  supertypes: ($) => [],

  conflicts: ($) => [[$.statement_, $.command], [$.argument_list]],

  word: ($) => $.word,

  rules: {
    program: ($) => optional_with_placeholder("statement_list", $.statements_),

    statement: ($) => seq($.statement_, optional(seq("\n", $.heredoc_body)), $._terminator),

    statements_: ($) =>
      prec(
        1,
        seq(
          repeat($.statement),
          field(
            "last_statement",
            seq($.statement_, optional(seq("\n", $.heredoc_body)), optional($._terminator))
          )
        )
      ),

    // We need the inlined variant in certain contexts.
    _statements2: ($) => repeat1($.statement),

    statement_list: ($) => repeat1($.statement),

    terminated_statement_: ($) => seq($.statement_, $._terminator),

    // Statements

    statement_: ($) =>
      choice(
        $.redirected_statement,
        $.variable_declaration,
        $.command,
        $.declaration_command,
        $.unset_command,
        $.test_command,
        $.negated_command,
        $.for,
        $.while,
        $.if,
        $.case_statement,
        $.pipeline,
        $.list,
        $.subshell,
        $.enclosed_body,
        $.function
      ),

    redirected_statement: ($) =>
      prec(
        -1,
        seq(
          field("body", $.statement_),
          field(
            "redirect",
            repeat1(choice($.file_redirect, $.heredoc_redirect, $.herestring_redirect))
          )
        )
      ),

    for: ($) => choice($.for_clause, $.for_each_clause),

    block_collection: ($) => repeat1($._literal),

    for_each_clause: ($) =>
      seq(
        "for",
        field("block_iterator", $._simple_variable_name),
        optional(field("for_each_separator", seq("in", $.block_collection))),
        $._terminator,
        field("enclosed_body", $.do_group)
      ),

    for_clause: ($) =>
      seq(
        "for",
        "((",
        optional_with_placeholder(
          "block_initializer_optional",
          alias($.expression_, $.block_initializer)
        ),
        $._terminator,
        optional_with_placeholder("condition_optional", alias($.expression_, $.condition)),
        $._terminator,
        optional_with_placeholder("block_update_optional", alias($.expression_, $.block_update)),
        "))",
        optional(";"),
        field("enclosed_body", choice($.do_group, $.enclosed_body))
      ),

    while_clause: ($) =>
      seq("while", field("condition", $.terminated_statement_), field("enclosed_body", $.do_group)),

    while: ($) => $.while_clause,

    do_group: ($) =>
      seq("do", optional_with_placeholder("statement_list", $.statement_list), "done"),

    if: ($) =>
      seq(
        $.if_clause,
        optional_with_placeholder("else_if_clause_list", repeat($.else_if_clause)),
        optional_with_placeholder("else_clause_optional", $.else_clause),
        "fi"
      ),

    // conditions are not tagged here, since they are caught inside test_command
    if_clause: ($) =>
      seq(
        "if",
        field("condition_", $.terminated_statement_),
        "then",
        optional_with_placeholder("statement_list", $.statement_list)
      ),

    else_if_clause: ($) =>
      seq(
        "elif",
        field("condition_", $.terminated_statement_),
        "then",
        optional_with_placeholder("statement_list", $.statement_list)
      ),

    else_clause: ($) => seq("else", optional_with_placeholder("statement_list", $.statement_list)),

    case_statement: ($) =>
      seq(
        "case",
        field("value", $._literal),
        optional($._terminator),
        "in",
        $._terminator,
        optional(seq(repeat($.case_item), alias($.last_case_item, $.case_item))),
        "esac"
      ),

    case_item: ($) =>
      seq(
        field("value", $._literal),
        repeat(seq("|", field("value", $._literal))),
        ")",
        optional($.statements_),
        prec(1, choice(field("termination", ";;"), field("fallthrough", choice(";&", ";;&"))))
      ),

    last_case_item: ($) =>
      seq(
        field("value", $._literal),
        repeat(seq("|", field("value", $._literal))),
        ")",
        optional($.statements_),
        optional(prec(1, ";;"))
      ),

    // Only used for functions.
    identifier: ($) => $.word,

    function: ($) =>
      seq(
        choice(seq("function", $.identifier, optional(seq("(", ")"))), seq($.identifier, "(", ")")),
        field("body", choice($.enclosed_body, $.subshell, $.test_command))
      ),

    enclosed_body: ($) =>
      seq("{", optional_with_placeholder("statement_list", $.statement_list), "}"),

    subshell: ($) => seq("(", $.statements_, ")"),

    pipeline: ($) => prec.left(1, seq($.statement_, choice("|", "|&"), $.statement_)),

    list: ($) => prec.left(-1, seq($.statement_, choice("&&", "||"), $.statement_)),

    // Commands

    negated_command: ($) => seq("!", choice($.command, $.test_command, $.subshell)),

    condition: ($) => $.expression_,

    test_command: ($) =>
      seq(
        choice(
          seq("[", $.condition, "]"),
          seq("[[", $.condition, "]]"),
          seq("((", $.condition, "))")
        )
      ),

    declaration_command: ($) =>
      prec.left(
        seq(
          choice("declare", "typeset", "export", "readonly", "local"),
          repeat(choice($._literal, $._simple_variable_name, $.variable_declaration))
        )
      ),

    unset_command: ($) =>
      prec.left(
        seq(choice("unset", "unsetenv"), repeat(choice($._literal, $._simple_variable_name)))
      ),

    command: ($) =>
      prec.left(
        seq(
          repeat(choice($.variable_declaration, $.file_redirect)),
          field("name", $.command_name),
          optional_with_placeholder("argument_list", $.argument_list)
        )
      ),

    argument_list: ($) => repeat1($.argument),

    argument: ($) =>
      choice(alias($._literal, $.identifier), seq(choice("=~", "=="), choice($._literal, $.regex))),

    command_name: ($) => $._literal,

    assignment_variable: ($) => field("identifier", choice($.variable_name, $.subscript)),

    assignment: ($) =>
      seq(
        $.assignment_variable,
        choice("=", "+="),
        field("assignment_value", choice($._literal, $.array, $._empty_value))
      ),

    variable_declaration: ($) => field("assignment_list", $.assignment),

    subscript: ($) =>
      seq(
        field("name", $.variable_name),
        "[",
        field("index", $._literal),
        optional($._concat),
        "]",
        optional($._concat)
      ),

    file_redirect: ($) =>
      prec.left(
        seq(
          optional($.file_descriptor), //descriptor
          choice("<", ">", ">>", "&>", "&>>", "<&", ">&", ">|"),
          field("destination", $._literal)
        )
      ),

    heredoc_redirect: ($) => seq(choice("<<", "<<-"), $.heredoc_start),

    heredoc_body: ($) =>
      choice(
        $._simple_heredoc_body,
        seq(
          $._heredoc_body_beginning,
          repeat(
            choice($.expansion, $.simple_expansion, $.command_substitution, $._heredoc_body_middle)
          ),
          $._heredoc_body_end
        )
      ),

    herestring_redirect: ($) => seq("<<<", $._literal),

    // Expressions

    expression_: ($) =>
      choice(
        $._literal,
        $.unary_expression,
        $.ternary_expression,
        $.binary_expression,
        $.postfix_expression,
        $.parenthesized_expression
      ),

    binary_expression: ($) =>
      prec.left(
        choice(
          seq(
            field("left", $.expression_),
            field(
              "operator",
              choice(
                "=",
                "==",
                "=~",
                "!=",
                "+",
                "-",
                "+=",
                "-=",
                "<",
                ">",
                "<=",
                ">=",
                "||",
                "&&",
                $.test_operator
              )
            ),
            $.expression_ // right
          ),
          seq(
            field("left", $.expression_),
            field("operator", choice("==", "=~")),
            $.regex // right
          )
        )
      ),

    ternary_expression: ($) =>
      prec.left(
        seq(
          field("condition", $.expression_),
          "?",
          field("consequence", $.expression_),
          ":",
          field("alternative", $.expression_)
        )
      ),

    unary_expression: ($) => prec.right(seq(choice("!", $.test_operator), $.expression_)),

    postfix_expression: ($) => seq($.expression_, choice("++", "--")),

    parenthesized_expression: ($) => seq("(", $.expression_, ")"),

    // Literals

    _literal: ($) =>
      choice(
        $.concatenation,
        $.primary_expression_,
        prec(-2, repeat1($.special_character_))
      ),

    primary_expression_: ($) =>
      choice(
        $.word,
        $.string,
        $.raw_string,
        $.ansii_c_string,
        $.expansion,
        $.simple_expansion,
        $.string_expansion,
        $.command_substitution,
        $.process_substitution
      ),

    concatenation: ($) =>
      prec(
        -1,
        seq(
          choice($.primary_expression_, $.special_character_),
          repeat1(prec(-1, seq($._concat, choice($.primary_expression_, $.special_character_)))),
          optional(seq($._concat, "$"))
        )
      ),

    special_character_: ($) => token(prec(-1, choice("{", "}", "[", "]"))),

    string: ($) =>
      seq(
        '"',
        repeat(
          seq(
            choice(
              seq(optional("$"), $._string_content),
              $.expansion,
              $.simple_expansion,
              $.command_substitution
            ),
            optional($._concat)
          )
        ),
        optional("$"),
        '"'
      ),

    _string_content: ($) => token(prec(-1, /([^"`$\\]|\\(.|\n))+/)),

    array: ($) => seq("(", repeat($._literal), ")"),

    raw_string: ($) => /'[^']*'/,

    ansii_c_string: ($) => /\$'([^']|\\')*'/,

    simple_expansion: ($) =>
      seq(
        "$",
        choice(
          $._simple_variable_name,
          field("special_variable_name1", $._special_variable_name),
          alias("!", $.special_variable_name2),
          alias("#", $.special_variable_name3)
        )
      ),

    string_expansion: ($) => seq("$", choice($.string, $.raw_string)),

    expansion: ($) =>
      seq(
        "${",
        optional(choice("#", "!")),
        optional(
          choice(
            seq($.variable_name, "=", optional($._literal)),
            seq(
              choice($.subscript, $._simple_variable_name, 
                field("special_variable_name", $._special_variable_name)),
              optional(seq(token(prec(1, "/")), optional($.regex))),
              repeat(choice($._literal, ":", ":?", "=", ":-", "%", "-", "#"))
            )
          )
        ),
        "}"
      ),

    command_substitution: ($) =>
      choice(
        seq("$(", $.statements_, ")"),
        seq("$(", $.file_redirect, ")"),
        prec(1, seq("`", $.statements_, "`"))
      ),

    process_substitution: ($) => seq(choice("<(", ">("), $.statements_, ")"),

    comment: ($) => token(prec(-10, /#.*/)),

    _simple_variable_name: ($) => alias(/\w+/, $.variable_name),

    _special_variable_name: ($) =>
      choice("*", "@", "?", "-", "$", "0", "_"),

    word: ($) => token(repeat1(choice(noneOf(...SPECIAL_CHARACTERS), seq("\\", noneOf("\\s"))))),

    test_operator: ($) => token(prec(1, seq("-", /[a-zA-Z]+/))),

    _terminator: ($) => choice(";", ";;", "\n", "&"),
  },
});

function noneOf(...characters) {
  const negatedString = characters.map((c) => (c == "\\" ? "\\\\" : c)).join("");
  return new RegExp("[^" + negatedString + "]");
}

function optional_with_placeholder(field_name, rule) {
  return choice(field(field_name, rule), field(field_name, blank()));
}
