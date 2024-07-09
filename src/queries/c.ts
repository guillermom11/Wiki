// Tree-sitter definition + call queries for Java

// It considers:
// - Import statements
// - Class definitions

// - Class and methods
// - member expressions like this.my_method and Class.my_method
// - Arguments

import { treeSitterQueries } from './index';

///////////////////////
// IMPORT_STATEMENTS //
///////////////////////
const importStatements = `
( preproc_include path: (system_lib_string) @module) @import_statement
( preproc_include path: (string_literal (_) @module)) @import_statement

`

/////////////////
// ASSIGNMENTS //
/////////////////
// Java has no global assignments
const assignments = `
(translation_unit
	(declaration
    	declarator: (init_declarator
        		declarator: (_)
                value: (_)
        	) 
    ) @assignment
)
`

//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////
// modifier can be public, private or protected. By default is private
const definitionTemplate = `
( _
    type: (_)? @return_type
    [
     name: (_) @name
     declarator: (function_declarator declarator: (identifier) @name) 
    ]
    parameters: (parameter_list (_) @param)?
    body: (_)? @body
)?

; For global assignments
(declaration
    declarator: (
        init_declarator
            declarator: [
                (identifier) @name
                (pointer_declarator declarator: (identifier) @name)
                ]
            value: (_) @body
        ) 
) 
`


// constructor methods have the same name as the class
// NOTE: @function is passed as method if is inside a class
const constructorDefinitions = `
(function_definition) @function
(declaration (function_declarator)) @function
(struct_specifier) @struct
(union_specifier) @union
`

// ASSIGNMENT SPECIAL CASE
const extraAssignmentCode = (name: string) => `
( translation_unit
    (expression_statement
        (call_expression function:
        	[(identifier) @identifier.name
             (field_expression (identifier)  @identifier.name  ) 
            ]
        (#eq? @identifier.name "${name}")
        ) @code
    )
)
    ` 

const calls = `
(call_expression function: _ @identifier.name)
( _ arguments: (argument_list (identifier) @identifier.name) )
`

///////////
// Assignments are necessary to get the correct calls. For example:
// > my_class = MyClass()
// > my_class.my_method()
const anyAssignments = `
(declaration
    declarator: (
        init_declarator
            declarator: [
                (identifier) @left
                (pointer_declarator declarator: (identifier) @left)
                ]
            value: (_) @right
        ) 
) @assignment
`

export const cQueries: treeSitterQueries = {
    importStatements,
    constructorDefinitions: assignments + constructorDefinitions,
    definitionTemplate,
    exportClauses: '',
    extraAssignmentCode,
    calls,
    assignments: anyAssignments,
    spaceDeclaration: ''
}