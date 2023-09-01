module.exports = {
    root: true,
    env: {
        es6: true,
        node: true
    },

    parser: '@typescript-eslint/parser',

    extends: [
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:promise/recommended'
    ],

    plugins: [
        '@typescript-eslint',
        'promise',
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


        /////////////////
        //// Temporarily disabled Rules (enable and fix as appropriate)
        '@typescript-eslint/naming-convention': ['off'],
        '@typescript-eslint/no-explicit-any': ['off'],
        '@typescript-eslint/no-inferrable-types': ['off'],
        '@typescript-eslint/no-shadow': ['off'],
        '@typescript-eslint/no-unsafe-argument': ['off'],
        '@typescript-eslint/no-unsafe-assignment': ['off'],


        '@typescript-eslint/restrict-plus-operands': ['off'],
        '@typescript-eslint/unbound-method': ['off'],
        'array-callback-return': ['off'],
        'arrow-body-style': ['off'],
        'arrow-parens': ['off'],
        'consistent-return': ['off'],
        'default-case': ['off'],
        'func-names': ['off'],
        'function-paren-newline': ['off'],
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
    },

    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            extends: [
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
                'plugin:promise/recommended'
            ],

            parserOptions: {
                project: ['./tsconfig.json']
            },
            rules: {
                '@typescript-eslint/no-unused-vars': ['off'],
                '@typescript-eslint/no-explicit-any': ['off'],
                '@typescript-eslint/no-unsafe-argument': ['off'],
                '@typescript-eslint/no-unsafe-assignment': ['off'],
                '@typescript-eslint/no-unsafe-member-access': ['off'],
                '@typescript-eslint/no-unsafe-return': ['off'],
                '@typescript-eslint/require-await': ['off'],
                'no-multiple-empty-lines': ['off'],
                '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: true, variables: true, typedefs: true },],
                'promise/always-return': ['error'],
                'promise/catch-or-return': ['error'],
                'promise/no-callback-in-promise': ['error'],
            }

        }
    ]
}
