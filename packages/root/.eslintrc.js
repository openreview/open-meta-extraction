module.exports = {
        root: false,
        env: {
                browser: true,
                mocha: true,
                es6: true,
                jest: true,
                node: true
        },
        parser: '@typescript-eslint/parser',

        extends: [
                'airbnb-base',
                'airbnb-typescript',
                'plugin:@typescript-eslint/recommended',
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
                'plugin:eslint-comments/recommended',
                'plugin:jest/recommended',
                'plugin:promise/recommended',
                'plugin:unicorn/recommended',
                'plugin:import/recommended'
        ],

        plugins: [
                '@typescript-eslint',
                'eslint-comments',
                'jest',
                'promise',
                'unicorn',
                'import'
        ],

        globals: {
                expect: true
        },

        rules: {
                /////////////////
                /// Desired Rules
                '@typescript-eslint/lines-between-class-members': ['off'],
                '@typescript-eslint/space-before-function-paren': ['off'],
                '@typescript-eslint/space-infix-ops': ['off'],
                'unicorn/prevent-abbreviations': 'off',
                'react/destructuring-assignment': 'off',
                // These two are disabled b/c they rely on react rules (no react used in these projects)
                'react/jsx-filename-extension': 'off',
                'unicorn/prefer-node-protocol': ['off'],
                // 'object-curly-newline': ["error", { "multiline": true }],
                'object-curly-newline': ['off'],
                'implicit-arrow-linebreak': ['off'],
                'object-property-newline': ['off'],
                'unicorn/no-this-assignment': ['off'],
                'unicorn/no-array-method-this-argument': ['off'],
                '@typescript-eslint/no-this-alias': ['error', {
                        allowDestructuring: true, // Allow `const { props, state } = this`; false by default
                        allowedNames: ['self'] // Allow `const self = this`; `[]` by default
                }],
                'operator-linebreak': 'off',

                // Disabled b/c it interferes with idomatic identical naming of type/const value in io-types decoders
                // '@typescript-eslint/no-redeclare': ['error', { ignoreDeclarationMerge: true }],
                '@typescript-eslint/no-redeclare': ['off'],
                '@typescript-eslint/comma-dangle': ['off'],

                '@typescript-eslint/no-floating-promises': ['off'],
                '@typescript-eslint/no-misused-promises': ['off'],
                'promise/always-return': ['error'],
                'promise/catch-or-return': ['error'],
                'promise/no-callback-in-promise': ['error'],

                /////////////////
                //// Temporarily disabled Rules (enable and fix as appropriate)
                '@typescript-eslint/naming-convention': ['off'],
                '@typescript-eslint/no-explicit-any': ['off'],
                '@typescript-eslint/no-inferrable-types': ['off'],
                '@typescript-eslint/no-shadow': ['off'],
                '@typescript-eslint/no-unsafe-argument': ['off'],
                '@typescript-eslint/no-unsafe-assignment': ['off'],
                '@typescript-eslint/no-unsafe-call': ['off'],
                '@typescript-eslint/no-unsafe-member-access': ['off'],
                '@typescript-eslint/no-unsafe-return': ['off'],
                '@typescript-eslint/no-unused-vars': ['off'],
                '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: true, variables: true, typedefs: true },],
                '@typescript-eslint/require-await': ['off'],
                '@typescript-eslint/restrict-plus-operands': ['off'],
                '@typescript-eslint/restrict-template-expressions': ['off'],
                '@typescript-eslint/unbound-method': ['off'],
                'array-callback-return': ['off'],
                'arrow-body-style': ['off'],
                'arrow-parens': ['off'],
                'consistent-return': ['off'],
                'default-case': ['off'],
                'func-names': ['off'],
                'function-paren-newline': ['off'],
                'import/extensions': ['error', 'never', { 'vue': 'always' }],
                'import/no-cycle': ['off'],
                'import/no-default-export': ['off'],
                'import/no-extraneous-dependencies': 'off',
                'import/no-unresolved': ['off'],
                'import/prefer-default-export': 'off',
                'jest/expect-expect': ['off'],
                'jest/no-conditional-expect': ['off'],
                'jest/no-done-callback': ['off'],
                'jest/no-focused-tests': ['off'],
                'max-classes-per-file': ['off'],
                'max-len': ['off'],
                'no-case-declarations': ['off'],
                'no-console': ['off'],
                'no-empty-pattern': ['off'],
                'no-multi-assign': ['off'],
                'no-multiple-empty-lines': ['warn', { 'max': 2, 'maxBOF': 0, 'maxEOF': 1 }],
                'no-param-reassign': ['off'],
                'no-plusplus': ['off'],
                'no-restricted-globals': ['off'],
                'no-underscore-dangle': ['off'],
                'semi-style': ['off'],
                'unicorn/consistent-destructuring': ['off'],
                'unicorn/consistent-function-scoping': ['off'],
                'unicorn/filename-case': ['off'],
                'unicorn/import-style': ['off'],
                'unicorn/no-array-callback-reference': ['off'],
                'unicorn/no-array-for-each': 'off',
                'unicorn/no-null': ['off'],
                'unicorn/prefer-dom-node-text-content': ['off'],
                'unicorn/prefer-spread': ['off']
        },

        overrides: [
                {
                        files: ['*.ts', '*.tsx'], // Your TypeScript files extension

                        // As mentioned in the comments, you should extend TypeScript plugins here,
                        // instead of extending them outside the `overrides`.
                        // If you don't want to extend any rules, you don't need an `extends` attribute.
                        extends: [
                                'plugin:@typescript-eslint/recommended',
                                'plugin:@typescript-eslint/recommended-requiring-type-checking',
                        ],

                        parserOptions: {
                                project: ['./tsconfig.json'], // Specify it only for TypeScript files
                        },
                }
        ]
}
