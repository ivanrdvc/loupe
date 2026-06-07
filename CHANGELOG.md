# Changelog

## [0.5.0](https://github.com/ivanrdvc/loupe/compare/loupe-v0.4.0...loupe-v0.5.0) (2026-06-07)


### Features

* **datasets:** wire real backend and retire standalone prompts ([#46](https://github.com/ivanrdvc/loupe/issues/46)) ([57589aa](https://github.com/ivanrdvc/loupe/commit/57589aae26087e41902c9699389e4836383a1e0d))
* **evals:** evaluation suite for scores, judges, datasets & tool grading ([#48](https://github.com/ivanrdvc/loupe/issues/48)) ([ef2cde7](https://github.com/ivanrdvc/loupe/commit/ef2cde72eb2e587df25e3db66f293abbe695147f))
* **notifications:** header bell + sidebar changelog dot ([#45](https://github.com/ivanrdvc/loupe/issues/45)) ([ea2e128](https://github.com/ivanrdvc/loupe/commit/ea2e12867c52fa3688a7108d912c1254a8cff8bd))
* **tools:** tool drawer + catalog + home rework ([#41](https://github.com/ivanrdvc/loupe/issues/41)) ([0f077d3](https://github.com/ivanrdvc/loupe/commit/0f077d35fbd8155d787a4cb630a56f1fa49e7568))
* **tools:** unify tool viz, decouple detection from reads ([#51](https://github.com/ivanrdvc/loupe/issues/51)) ([69ba0ea](https://github.com/ivanrdvc/loupe/commit/69ba0ea371058582ccbcca069d2232aa6a37b7aa))


### Bug Fixes

* **inspect:** scoped auto-refresh + decouple raw-spans toggles ([#43](https://github.com/ivanrdvc/loupe/issues/43)) ([5b950ce](https://github.com/ivanrdvc/loupe/commit/5b950cee46e17d38da4a550060a4cc73d6f05cb7))
* share auto-refresh interval across consumers ([#37](https://github.com/ivanrdvc/loupe/issues/37)) ([c7e811e](https://github.com/ivanrdvc/loupe/commit/c7e811eaf11833467fdf520105ebaa9407cfd2c7))

## [0.4.0](https://github.com/ivanrdvc/loupe/compare/agentops-v0.3.0...agentops-v0.4.0) (2026-05-26)


### Features

* maf-sandbox skill + inspect/home-chart polish ([#32](https://github.com/ivanrdvc/loupe/issues/32)) ([994f3a7](https://github.com/ivanrdvc/loupe/commit/994f3a738168f5d98fcf465bed7e9a0b6c876f96))
* notes workflow + prompts foundation ([#29](https://github.com/ivanrdvc/loupe/issues/29)) ([a93447d](https://github.com/ivanrdvc/loupe/commit/a93447d3bf9c9813493645576ee78e954df22b12))
* truncation resilience, inspect polish, and prompt/palette improvements ([#33](https://github.com/ivanrdvc/loupe/issues/33)) ([79f87a2](https://github.com/ivanrdvc/loupe/commit/79f87a2a57f0fcd31b9e07f5db6d4819404a1e12))


### Bug Fixes

* **prompts:** row filtering + reset state on navigation ([#31](https://github.com/ivanrdvc/loupe/issues/31)) ([1e70c29](https://github.com/ivanrdvc/loupe/commit/1e70c29fd6fceabbff2985f900764230eddc2005))

## [0.3.0](https://github.com/ivanrdvc/loupe/compare/agentops-v0.2.0...agentops-v0.3.0) (2026-05-23)


### Features

* **changelog:** add changelog page from CHANGELOG.md ([#27](https://github.com/ivanrdvc/loupe/issues/27)) ([b13409d](https://github.com/ivanrdvc/loupe/commit/b13409d808cdd96a8e98f20afd18829afeaacf87))
* **session-inspect:** real logs panel + shiki json + tasks scaffold ([#26](https://github.com/ivanrdvc/loupe/issues/26)) ([cf4d0d3](https://github.com/ivanrdvc/loupe/commit/cf4d0d35b8677bafba22571a0a7f9e86a74c0add))
* **spans:** sub-agent rows + turn cost rollup ([#25](https://github.com/ivanrdvc/loupe/issues/25)) ([5e7f316](https://github.com/ivanrdvc/loupe/commit/5e7f316cd7a02a92e2820bd848e84ed306888da9))
* **tasks:** build out tasks page + producer docs ([#28](https://github.com/ivanrdvc/loupe/issues/28)) ([d53214a](https://github.com/ivanrdvc/loupe/commit/d53214afbb5cfefec14f74fc3a0c43496d95dc72))
* **theme:** neutral default + Slack/VS Code themes, tighter input text ([eac702a](https://github.com/ivanrdvc/loupe/commit/eac702a9f1ffd94300e0eba7550e39b47315202d))

## [0.2.0](https://github.com/ivanrdvc/loupe/compare/agentops-v0.1.1...agentops-v0.2.0) (2026-05-20)


### Features

* **shadcn:** migrate UI from Catalyst to shadcn ([#13](https://github.com/ivanrdvc/loupe/issues/13)) ([7716c1f](https://github.com/ivanrdvc/loupe/commit/7716c1f9540edae9ce16cb232d04cc7dfa00048d))
* **traces:** traces view + home charts ([#18](https://github.com/ivanrdvc/loupe/issues/18)) ([4a740ba](https://github.com/ivanrdvc/loupe/commit/4a740ba16c18038962e1e7f22ab53477366aff18))
* utility LLM classification, custom fields, session inspect polish ([#16](https://github.com/ivanrdvc/loupe/issues/16)) ([cb421e2](https://github.com/ivanrdvc/loupe/commit/cb421e214e20f53ccb7f64fa06cb278691e6136b))
* workbench scaffolding (prompts + notes) ([#20](https://github.com/ivanrdvc/loupe/issues/20)) ([de54f0d](https://github.com/ivanrdvc/loupe/commit/de54f0d2ccfc3eb15d4c8aac2b39e65304a09674))
* **workbench:** notes overhaul + inspect drawer redesign ([#22](https://github.com/ivanrdvc/loupe/issues/22)) ([eab3fb0](https://github.com/ivanrdvc/loupe/commit/eab3fb0dfc53a06710b205ddb4e74fa53e9fe159))

## [0.1.1](https://github.com/ivanrdvc/loupe/compare/agentops-v0.1.0...agentops-v0.1.1) (2026-05-17)


### Features

* **session-inspect:** frontend tools, /docs skill, sessions table refactor ([#8](https://github.com/ivanrdvc/loupe/issues/8)) ([3715410](https://github.com/ivanrdvc/loupe/commit/37154109484d47a9c52aafffbed131d658d1a381))

## 0.1.0 (2026-05-17)


### Features

* build out app shell with sessions, live, inbox, mcp ([4f90c85](https://github.com/ivanrdvc/loupe/commit/4f90c85dc1b0c521907fad3fa8714af800ef2761))
* runs viewer and project scaffolding ([1702a2b](https://github.com/ivanrdvc/loupe/commit/1702a2b1fcd0fc504acd4ee95eccb1dcfeea2e88))
* sessions and observability UI refresh ([052be47](https://github.com/ivanrdvc/loupe/commit/052be47bb5cfd7b315d4a1021c92ac7f45fd531c))
* sessions inventory, time-range filter, and trace drawer ([3d7cddf](https://github.com/ivanrdvc/loupe/commit/3d7cddf842203570b2487db5480ad921490e98a5))
* sessions UI refresh + telemetry provider boundary ([f25ad4a](https://github.com/ivanrdvc/loupe/commit/f25ad4a837d067d2df8c7da02500f70d3e9e58d2))
* sessions view, conversation builder, span classifier ([7441e79](https://github.com/ivanrdvc/loupe/commit/7441e7943939f52cc50d37ea2b87a19dd86b8719))
* telemetry providers and runs list overhaul ([e8db11e](https://github.com/ivanrdvc/loupe/commit/e8db11e04f288618044b4d309c98969d1810d2d0))


### Bug Fixes

* move token counting server-side, drop @anthropic-ai/tokenizer ([1746584](https://github.com/ivanrdvc/loupe/commit/17465845fd9e6c1cd150a67052de1d54ceabcb3e))
