#!/bin/sh
set -eu
cd "$HOME/wan-lab"
./lab ps
./lab collect
