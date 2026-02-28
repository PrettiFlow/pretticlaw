#!/usr/bin/env node
import "dotenv/config";
import { buildProgram } from "./cli/commands.js";

const program = buildProgram();
program.parseAsync(process.argv);
