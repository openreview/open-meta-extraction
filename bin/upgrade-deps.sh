#!/bin/bash

declare -a dirs=(
   commonlib
   field-extractors
   root
   services
   spider
)

for i in "${dirs[@]}"
do
   cd "packages/$i" || exit
   ncu -ui
   cd ../..
done
