// Tree-sitter definition + call queries for JavaScript

// It considers:
// - Import statements
// - Global Assignments
// - Function definitions
// - Class definitions
// - Export clauses

// - Class, Method and Function calls
// - member expressions like this.my_method and Class.my_method
// - Arguments

import { treeSitterQueries } from './index';

///////////////////////
// IMPORT_STATEMENTS //
///////////////////////
// If there is no import.name  then no component is really imported
// import.module considers only the string fragment
const importStatements = `
(import_statement 
    (import_clause [
    (namespace_import (identifier) @alias)
    (identifier) @name
    (named_imports (import_specifier
		    name: (_) @name
    		alias: (_)? @alias))
    ])?
	source: (string (string_fragment) @module)
) @import_statement


(lexical_declaration
    (variable_declarator
      name: [
          (identifier) @name
          (object_pattern (_) @name)
      ]
      value: [(call_expression
                  function: _ @function
                  arguments: (arguments (string (string_fragment) @module))
                  (#eq? @function "require"))
              ( member_expression
                (call_expression
                    function: _ @function
                    arguments: (arguments (string (string_fragment) @module))
                    (#eq? @function "require")
                )
                (property_identifier) @submodule
               )
              ]
    )           
  ) @import_statement
`

/////////////////
// ASSIGNMENTS //
/////////////////
// Arrow functions are like assignments but contains a body in value
// Therefore, to remove them from assignments check if body exists in @right

// Global only
const assignments = `
(program
    (_
        (variable_declarator
            name: (identifier)
            value: (_ !body) ; to exclude arrow functions
        ) @assignment
    )
) 

; exportables
(program
    (export_statement
        (_
            (variable_declarator
                name: (identifier)
                value: (_ !body)
            ) @assignment
        )
    )
)
`

//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////

const definitionTemplate = `
( _
    name: (_) @name
    parameters: (formal_parameters (_) @param)?
    [body: (_)
    ; for types
    value: (_)] @body
)?

; arrow function
(variable_declarator
	name: (_) @name
	value: (arrow_function
    	parameters: (formal_parameters (_) @param)?
        body: (_)? @body
			)
)?
`

const arrowFunctionConstructor = "(lexical_declaration (variable_declarator value: (arrow_function) ) )"

// The only way to detect if is async is to check if the function definition contains "async"
const constructorDefinitions = `
; export
(export_statement) @export

; functions
(function_declaration) @function

; arrow functions
${arrowFunctionConstructor} @function

; classes
(method_definition)? @method
(class_declaration) @class
`

////////////////////
// EXPORTS_CLAUSES //
////////////////////
// Export clauses can contain an alias
const exportClauses = `
(export_clause (
    export_specifier
        name: (_) @name
          alias: (_)? @alias
          )
    )
`

// ASSIGNMENT SPECIAL CASE
// this is for example if I use something like
// ```
// const myEndpoint = new Hono()
// myEndpoint.get('/', (c) => c.text('Hello World'))
// ```
// It will include the myEndpoint.get to the code of the assignment
const extraAssignmentCode = (name: string) => `
( program
    (expression_statement
        (call_expression function: (_) @identifier.name
            (#match? @identifier.name "^${name}")
        ) @code
    )
) 
`

const calls = `
; any call
(call_expression function: (_) @identifier.name)

; calls to member expressions 
(assignment_expression right: (member_expression) @identifier.name)

; arguments
(arguments (identifier) @identifier.name)

; any member_expression
( _ (member_expression) @identifier.name)

; new_expression
(new_expression (identifier) @identifier.name)

; keyword arguments
(pair value: (identifier) @identifier.name)
( variable_declarator value: (identifier) @identifier.name)

; any object
( _ object: _ @identifier.name)
`

///////////
// Assignments are necessary to get the correct calls. For example:
// > my_class = MyClass()
// > my_class.my_method()
// should be considered as a call to MyClass.my_method()
const anyAssignments = `
(assignment_expression
	left: (identifier) @left
    right: [
    (identifier) @right
    (member_expression) @right
    (new_expression constructor: _ @right )
    ] 
) @assignment

(variable_declarator
	name: (identifier) @left
    value: [
    (identifier) @right
    (member_expression) @right
    (new_expression constructor: _ @right )
    ] 
) @assignment

; experimental, cases like object.forEach( o => ...), supports forEach, map and reduce
(call_expression
    function:
    ( member_expression .
      object: (identifier) @left
      property: (property_identifier) @property
      (#any-of? @property "forEach" "map")
    )
     arguments:
     (arguments
          (arrow_function parameters:
            (formal_parameters . ((_) @right) ;first param
           )
         )
    ) 
) @assignment

(call_expression
    function:
    ( member_expression .
      object: (identifier) @left
      property: (property_identifier) @property
      (#any-of? @property "reduce")
    )
     arguments:
     (arguments
          (arrow_function parameters:
            (formal_parameters  ( (_) @right) . ;last param
           )
         )
    ) 
) @assignment
`

export const jsQueries: treeSitterQueries = {
    importStatements,
    constructorDefinitions: assignments + constructorDefinitions,
    definitionTemplate,
    exportClauses,
    extraAssignmentCode,
    calls,
    assignments: anyAssignments
}