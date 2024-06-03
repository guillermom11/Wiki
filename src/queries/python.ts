// Tree-sitter definition queries for Python

// It considers:
// - Import statements
// - Global Assignments
// - Function definitions
// - Class definitions

// - Class and Function calls
// - Method and self.parameter calls
// - Class extensions
// - Pydantic like parameters
// - Typed parameters and return types of methods and functions

import { treeSitterQueries } from './index';

///////////////////////
// IMPORT_STATEMENTS //
///////////////////////
// Future imports have __future__ as module name
// if import.has_wildcard exists then it is a wildcard (*) import of name 
const importStatements = `
(import_statement
	name: [
      (dotted_name) @module
      (aliased_import name: _ @module alias: _ @alias)
    ] ) @import_statement

(import_from_statement
	module_name: _ @module
	name: [
      (dotted_name) @name
      (aliased_import name: _ @name alias: _ @alias)
    ]?
    (wildcard_import _ @wildcard)?
    ) @import_statement
    
(future_import_statement 
	name: [
		(dotted_name) @name
		(aliased_import name: _ @name alias: _ @alias)
    ]) @import_statement
`

//////////////////////////////
// ASSIGNMENTS //
//////////////////////////////
// Globals only
const assignments = `
(module (expression_statement
	(assignment left: (identifier)
    		      right: (_)) 
      ) @assignment
)
`

//////////////////////////
// DEFINITIONS TEMPLATE //
//////////////////////////

const definitionTemplate = `
( _
      name: (identifier) @name
      parameters: (parameters (_) @param)?
      return_type: _? @return_type
      body: (block . (expression_statement (string) @documentation)? .
          _ ) @body )

; For global assignments   
(expression_statement
	(assignment left: (identifier) @name)
      )
`

// The only way to detect if is async is to check if the function definition contains "async"
// In Python all constructor are exportable by default
const constructorDefinitions = `
(function_definition) @function
(class_definition) @class
`

//// ASSIGNMENT SPECIAL CASE
// We need to know the assignment name
const extraAssignmentCode = (name: string) => `
( module
  (expression_statement
	(call function: (_) @identifier.name
    	(#match? @identifier.name "^${name}")
     ) @code
  )
)
`

const calls = `
; class and function calls
(call function: ( (identifier) @identifier.name))

; method calls like Class.method
(call function: ( (attribute) @identifier.name))

; self.parameter calls like self.parameter
((attribute
    object: (identifier) @object
    attribute: (identifier) @property
    (#eq? @object "self")) @identifier.name)


; class extensions
(class_definition
    superclasses : (argument_list (_) @class.extends)?
    body: (block
            (function_definition name: _ @class.method)?)) @class.definition

; pydantic like parameters                                        
(class_definition
        superclasses : (argument_list (_) @class.extends)?
        body: (block
                (expression_statement
                    (assignment type: (_)? @parameter_type) @assignment))
        ) @class.definition

; typed parameters and return types
(function_definition
    parameters: (parameters( typed_parameter type: _ @parameter_type)?)
    return_type: (_)? @return_type) @function.definiton

; assignments where they are identifiers
(expression_statement
	(assignment right: (identifier) @identifier.name)
)

; keyword arguments
(keyword_argument  value: (identifier) @identifier.name)

; any attribute
(_ (attribute) @identifier.name)

; arguments (identifier only)
(argument_list (identifier) @identifier.name)

; any object name
( _ object: _ @identifier.name)
`

/////////////
// Assignments are necessary to get the correct calls. For example:
// > my_class = MyClass()
// > my_class.my_method()
// should be considered as a call to MyClass.my_method()

const anyAssignments = `
(assignment
    left: (identifier) @left
    right: (_) @right
) @assignment
                          
(function_definition
  parameters: (
  parameters( typed_parameter (
              (identifier) @left)
                  type: _ @right)
  @assignment)
)
`

export const pyQueries: treeSitterQueries = { 
  importStatements,
  constructorDefinitions: assignments + constructorDefinitions,
  definitionTemplate,
  extraAssignmentCode,
  exportClauses: '',
  calls,
  assignments: anyAssignments 
   }
