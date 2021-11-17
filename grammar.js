const SPECIAL_CHARACTERS = [
  "'", '"',
  '<', '>',
  '{', '}',
  '\\[', '\\]',
  '(', ')',
  '`', '$',
  '|', '&', ';',
  '\\',
  '\\s',
  '#',
];

module.exports = grammar({
  name: 'bash',

  inline: $ => [
    $._terminator,
    $._literal,
    $._statements2,
    $._simple_variable_name,
    $._special_variable_name,
  ],

  externals: $ => [
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
    '}',
    ']',
    '<<',
    '<<-',
    '\n',
  ],

  extras: $ => [
    $.comment,
    /\\?\s/,
  ],

  supertypes: $ => [
  ],

  conflicts: $ => [
    [$.statement_, $.command]
  ],

  word: $ => $.word,

  rules: {
    program: $ => optional_with_placeholder('statement_list', $.statements_), 

    statement: $ => seq(
      $.statement_,
      optional(seq('\n', $.heredoc_body)),
      $._terminator
    ),

    statements_: $ => prec(1, seq(
      repeat($.statement),
      field('last_statement', seq(
        $.statement_,
        optional(seq('\n', $.heredoc_body)),
        optional($._terminator)
      )),
    )),

    _statements2: $ => repeat1($.statement), 


    terminated_statement_: $ => seq(
      $.statement_,
      $._terminator
    ),

    // Statements

    statement_: $ => choice(
      $.redirected_statement,
      $.variable_assignment,
      $.command,
      $.declaration_command,
      $.unset_command,
      $.test_command,
      $.negated_command,
      $.for_statement,
      $.c_style_for_statement,
      $.while_statement,
      $.if_statement,
      $.case_statement,
      $.pipeline,
      $.list,
      $.subshell,
      $.compound_statement,
      $.function_definition
    ),

    redirected_statement: $ => prec(-1, seq(
      field('body', $.statement_),
      field('redirect', repeat1(choice(
        $.file_redirect,
        $.heredoc_redirect,
        $.herestring_redirect
      )))
    )),

    for_statement: $ => seq(
      'for',
      field('variable', $._simple_variable_name),
      optional(seq(
        'in',
        field('value', repeat1($._literal))
      )),
      $._terminator,
      field('body', $.do_group)
    ),

    c_style_for_statement: $ => seq(
      'for',
      '((',
      field('initializer', optional($.expression_)),
      $._terminator,
      field('condition', optional($.expression_)),
      $._terminator,
      field('update', optional($.expression_)),
      '))',
      optional(';'),
      field('body', choice(
        $.do_group,
        $.compound_statement
      ))
    ),

    while_statement: $ => seq(
      'while',
      field('condition', $.terminated_statement_),
      field('body', $.do_group)
    ),

    do_group: $ => seq(
      'do',
      optional($._statements2),
      'done'
    ),

    if_statement: $ => seq(
      'if',
      field('condition', $.terminated_statement_),
      'then',
      optional($._statements2),
      repeat($.elif_clause),
      optional($.else_clause),
      'fi'
    ),

    elif_clause: $ => seq(
      'elif',
      $.terminated_statement_,
      'then',
      optional($._statements2)
    ),

    else_clause: $ => seq(
      'else',
      optional($._statements2)
    ),

    case_statement: $ => seq(
      'case',
      field('value', $._literal),
      optional($._terminator),
      'in',
      $._terminator,
      optional(seq(
        repeat($.case_item),
        alias($.last_case_item, $.case_item),
      )),
      'esac'
    ),

    case_item: $ => seq(
      field('value', $._literal),
      repeat(seq('|', field('value', $._literal))),
      ')',
      optional($.statements_),
      prec(1, choice(
        field('termination', ';;'),
        field('fallthrough', choice(';&', ';;&'))
      ))
    ),

    last_case_item: $ => seq(
      field('value', $._literal),
      repeat(seq('|', field('value', $._literal))),
      ')',
      optional($.statements_),
      optional(prec(1, ';;'))
    ),

    function_definition: $ => seq(
      choice(
        seq(
          'function',
          field('name', $.word),
          optional(seq('(', ')'))
        ),
        seq(
          field('name', $.word),
          '(', ')'
        )
      ),
      field(
        'body',
        choice(
          $.compound_statement,
          $.subshell,
          $.test_command)
      )
    ),

    compound_statement: $ => seq(
      '{',
      optional($._statements2),
      '}'
    ),

    subshell: $ => seq(
      '(',
      $.statements_,
      ')'
    ),

    pipeline: $ => prec.left(1, seq(
      $.statement_,
      choice('|', '|&'),
      $.statement_
    )),

    list: $ => prec.left(-1, seq(
      $.statement_,
      choice('&&', '||'),
      $.statement_
    )),

    // Commands

    negated_command: $ => seq(
      '!',
      choice(
        $.command,
        $.test_command,
        $.subshell
      )
    ),

    test_command: $ => seq(
      choice(
        seq('[', $.expression_, ']'),
        seq('[[', $.expression_, ']]'),
        seq('((', $.expression_, '))')
      )
    ),

    declaration_command: $ => prec.left(seq(
      choice('declare', 'typeset', 'export', 'readonly', 'local'),
      repeat(choice(
        $._literal,
        $._simple_variable_name,
        $.variable_assignment
      ))
    )),

    unset_command: $ => prec.left(seq(
      choice('unset', 'unsetenv'),
      repeat(choice(
        $._literal,
        $._simple_variable_name
      ))
    )),

    command: $ => prec.left(seq(
      repeat(choice(
        $.variable_assignment,
        $.file_redirect
      )),
      field('name', $.command_name),
      repeat(field('argument', choice(
        $._literal,
        seq(
          choice('=~', '=='),
          choice($._literal, $.regex)
        )
      )))
    )),

    command_name: $ => $._literal,

    variable_assignment: $ => seq(
      field('name', choice(
        $.variable_name,
        $.subscript
      )),
      choice(
        '=',
        '+='
      ),
      field('value', choice(
        $._literal,
        $.array,
        $._empty_value
      ))
    ),

    subscript: $ => seq(
      field('name', $.variable_name),
      '[',
      field('index', $._literal),
      optional($._concat),
      ']',
      optional($._concat)
    ),

    file_redirect: $ => prec.left(seq(
      field('descriptor', optional($.file_descriptor)),
      choice('<', '>', '>>', '&>', '&>>', '<&', '>&', '>|'),
      field('destination', $._literal)
    )),

    heredoc_redirect: $ => seq(
      choice('<<', '<<-'),
      $.heredoc_start
    ),

    heredoc_body: $ => choice(
      $._simple_heredoc_body,
      seq(
        $._heredoc_body_beginning,
        repeat(choice(
          $.expansion,
          $.simple_expansion,
          $.command_substitution,
          $._heredoc_body_middle
        )),
        $._heredoc_body_end
      )
    ),

    herestring_redirect: $ => seq(
      '<<<',
      $._literal
    ),

    // Expressions

    expression_: $ => choice(
      $._literal,
      $.unary_expression,
      $.ternary_expression,
      $.binary_expression,
      $.postfix_expression,
      $.parenthesized_expression
    ),

    binary_expression: $ => prec.left(choice(
      seq(
        field('left', $.expression_),
        field('operator', choice(
          '=', '==', '=~', '!=',
          '+', '-', '+=', '-=',
          '<', '>', '<=', '>=',
          '||', '&&',
          $.test_operator
        )),
        field('right', $.expression_)
      ),
      seq(
        field('left', $.expression_),
        field('operator', choice('==', '=~')),
        field('right', $.regex)
      )
    )),

    ternary_expression: $ => prec.left(
      seq(
        field('condition', $.expression_),
        '?',
        field('consequence', $.expression_),
        ':',
        field('alternative', $.expression_),
      )
    ),

    unary_expression: $ => prec.right(seq(
      choice('!', $.test_operator),
      $.expression_
    )),

    postfix_expression: $ => seq(
      $.expression_,
      choice('++', '--'),
    ),

    parenthesized_expression: $ => seq(
      '(',
      $.expression_,
      ')'
    ),

    // Literals

    _literal: $ => choice(
      $.concatenation,
      $.primary_expression_,
      alias(prec(-2, repeat1($._special_character)), $.word)
    ),

    primary_expression_: $ => choice(
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

    concatenation: $ => prec(-1, seq(
      choice(
        $.primary_expression_,
        $._special_character,
      ),
      repeat1(prec(-1, seq(
        $._concat,
        choice(
          $.primary_expression_,
          $._special_character,
        )
      ))),
      optional(seq($._concat, '$'))
    )),

    _special_character: $ => token(prec(-1, choice('{', '}', '[', ']'))),

    string: $ => seq(
      '"',
      repeat(seq(
        choice(
          seq(optional('$'), $._string_content),
          $.expansion,
          $.simple_expansion,
          $.command_substitution
        ),
        optional($._concat)
      )),
      optional('$'),
      '"'
    ),

    _string_content: $ => token(prec(-1, /([^"`$\\]|\\(.|\n))+/)),

    array: $ => seq(
      '(',
      repeat($._literal),
      ')'
    ),

    raw_string: $ => /'[^']*'/,

    ansii_c_string: $ => /\$'([^']|\\')*'/,

    simple_expansion: $ => seq(
      '$',
      choice(
        $._simple_variable_name,
        $._special_variable_name,
        alias('!', $.special_variable_name),
        alias('#', $.special_variable_name)
      )
    ),

    string_expansion: $ => seq('$', choice($.string, $.raw_string)),

    expansion: $ => seq(
      '${',
      optional(choice('#', '!')),
      optional(choice(
        seq(
          $.variable_name,
          '=',
          optional($._literal)
        ),
        seq(
          choice(
            $.subscript,
            $._simple_variable_name,
            $._special_variable_name
          ),
          optional(seq(
            token(prec(1, '/')),
            optional($.regex)
          )),
          repeat(choice(
            $._literal,
            ':', ':?', '=', ':-', '%', '-', '#'
          ))
        ),
      )),
      '}'
    ),

    command_substitution: $ => choice(
      seq('$(', $.statements_, ')'),
      seq('$(', $.file_redirect, ')'),
      prec(1, seq('`', $.statements_, '`'))
    ),

    process_substitution: $ => seq(
      choice('<(', '>('),
      $.statements_,
      ')'
    ),

    comment: $ => token(prec(-10, /#.*/)),

    _simple_variable_name: $ => alias(/\w+/, $.variable_name),

    _special_variable_name: $ => alias(choice('*', '@', '?', '-', '$', '0', '_'), $.special_variable_name),

    word: $ => token(repeat1(choice(
      noneOf(...SPECIAL_CHARACTERS),
      seq('\\', noneOf('\\s'))
    ))),

    test_operator: $ => token(prec(1, seq('-', /[a-zA-Z]+/))),

    _terminator: $ => choice(';', ';;', '\n', '&')
  }
});

function noneOf(...characters) {
  const negatedString = characters.map(c => c == '\\' ? '\\\\' : c).join('')
  return new RegExp('[^' + negatedString + ']')
}

function optional_with_placeholder(field_name, rule) {
  return choice(field(field_name, rule), field(field_name, blank()));
}
