# Third-party notices

Application code in the initial scaffold was new. Subsequent source adaptations
are identified below.
Architectural reference: https://github.com/Wei-Shaw/sub2api
The LGPLv3 license document in LICENSE is an unmodified copy of the GNU text,
also distributed by that repository. COPYING contains the referenced GPLv3 text.
Dependencies retain their respective licenses. Maintain dependency attribution
and redistribution notices when packaging releases.

The gateway identity mail adapter uses `lettre` 0.11 under its MIT license.
Rust package metadata and the Cargo lockfile retain the dependency identity;
redistributions must include the dependency's license notice.

## Imported codex-proxy-rs backend (2026-10-27)

The backend source under `src/apps`, `src/crates`, and `src/migrations` was
supplied by the user from https://github.com/zyycn/codex-proxy-rs/tree/main/backend.
Attribution: codex-proxy-rs contributors. The exact revision of the supplied
copy has not been independently verified. The imported code is Apache-2.0;
its complete license is retained in [src/LICENSE-APACHE](src/LICENSE-APACHE).
The repository's existing LGPL and other component notices remain applicable to
their respective sources; importing this backend does not replace those notices.

Ovload modifications on 2026-10-27: root workspace integration, flattened
application paths, library directory and Rust package/import names, synchronized
package versions, architecture-test paths, sanitized configuration example,
bounded Windows attempt-error storage, and associated documentation. No
provider protocol identities or financial behavior are changed by this baseline.
Migration CRLF line endings from the supplied copy were restored to canonical LF;
all 33 files match the imported frozen SHA-256 digests without SQL changes or
digest rewrites. Modified imported source files carry change notices.
Keep this section and the imported license in source and binary distributions.

The SQLx dependency retains the imported exact Git revision
`f1e94ec34dd5f11ad6488a3a8ac7988439a3f757` for BEGIN cancellation rollback.

## Sub2API notification email templates (2026-10-18)

The default email document and localized authentication/notification content in
`web/src/features/mail-settings/templates.ts` and
`web/src/i18n/locales/{en,zh}.json` adapt the `notificationEmailCard` helper and
official notification templates from Sub2API:
https://github.com/Wei-Shaw/sub2api/blob/6e6b5b9a4f98b173fa717a51a18b27e5fcfe740e/backend/internal/service/notification_email_service.go

Upstream revision: `6e6b5b9a4f98b173fa717a51a18b27e5fcfe740e`.
License: LGPL-3.0-only; the complete LGPLv3 and incorporated GPLv3 texts are
retained in `LICENSE` and `COPYING`. Attribution: Sub2API contributors.
Modified for Ovload on 2026-10-18: TypeScript generation, existing Ovload event
and variable contracts, bilingual greeting/footer, responsive spacing and text
wrapping, event-specific styling, and sandboxed local
previews. No Sub2API backend delivery or template-management code is included.

## Sub2API API-key client setup reference (2026-10-26)

The former preview group-to-client mapping, client environment/configuration fields and CCS
provider-link format (removed when the real model-key UI replaced preview credentials) adapted the
behavior of Sub2API's `frontend/src/utils/ccswitchImport.ts` and
`frontend/src/components/keys/UseKeyModal.vue`:
https://github.com/Wei-Shaw/sub2api/tree/b2f49f2bc325b35a29a3cef715216d45dacc4e9a/frontend/src

Upstream revision: `b2f49f2bc325b35a29a3cef715216d45dacc4e9a`.
License: LGPL-3.0-only; attribution: Sub2API contributors. Complete license texts
remain in `LICENSE` and `COPYING`. Ovload uses its existing React/shadcn dialogs,
explicit sample client mappings, reserved example endpoint and nonfunctional
sample credentials. It omits upstream usage scripts, hard-coded model defaults,
additional providers and browser-focus-based installation detection.

## Backend runtime additions (2026-09-21)

Site and personal image settings added on 2026-10-30 directly use the existing
locked `image` 0.25.10 library (MIT OR Apache-2.0,
https://github.com/image-rs/image) with only PNG/JPEG/WebP features enabled for this
caller. URL validation directly uses the existing locked `url` 2.5.8 library
(MIT OR Apache-2.0, https://github.com/servo/rust-url). These dependencies are
unmodified; retain their licenses when redistributing dependency sources.
WebP container preflight additionally uses unmodified `riff` 2.0.0 (MIT,
Copyright 2018 Francesco Bertolaccini, https://github.com/frabert/riff).
Its license is included in the crate's source distribution and applies to that
dependency; retain it when packaging dependency sources or binary notices.

Typed storage, worker and CLI errors directly use unmodified `thiserror` 2.0.20
(MIT OR Apache-2.0), source https://github.com/dtolnay/thiserror. It was already
present transitively; its version remains pinned in Cargo.lock. The package's
minimum supported Rust version is 1.71, below the project's pinned toolchain.

The bounded executor directly uses unmodified `tokio-util` 0.7.19 (MIT,
copyright Tokio Contributors), source https://github.com/tokio-rs/tokio.
Distributed lease ownership uses unmodified `uuid` 1.26.1 (MIT OR Apache-2.0),
source https://github.com/uuid-rs/uuid; copyright 2014 The Rust Project Developers
and 2018 Ashley Mannix, Christopher Armstrong, Dylan DPC, Hunar Roop Kahlon.
The existing Redis 1.7.0 dependency now enables its connection manager, bringing
`arc-swap` 1.9.2 (MIT OR Apache-2.0, copyright 2017 arc-swap developers,
https://github.com/vorner/arc-swap), `backon` 1.6.0 (Apache-2.0,
https://github.com/Xuanwo/backon), and `fastrand` 2.5.0 (MIT OR Apache-2.0).
Resolved versions and transitive packages are pinned in Cargo.lock. Retain each
crate's license and notices in redistributed dependency sources. The standard
MIT and Apache-2.0 terms reproduced below remain applicable to these components.
No database server or Redis server binary is embedded into the application.

## Backend request authentication (2026-10-27)

Model API-key verifier hashing directly uses unmodified `sha2` 0.10.9 from
RustCrypto, source https://github.com/RustCrypto/hashes. License: MIT OR
Apache-2.0, verified against the pinned crate's `Cargo.toml`, `LICENSE-MIT` and
`LICENSE-APACHE`. Attribution: Copyright (c) 2006-2009 Graydon Hoare;
2009-2013 Mozilla Foundation; 2016 Artyom Pavlov. Its MIT and Apache-2.0 terms
remain applicable; retain the crate's license files when redistributing sources.
Cargo.lock pins the dependency. The application uses its SHA-256 implementation
rather than implementing a cryptographic primitive.

Architecture tests directly use unmodified `syn` 2.0.119, source
https://github.com/dtolnay/syn, under MIT OR Apache-2.0. The parser was already
pinned transitively; direct use with its full syntax-tree visitor replaces the
repository's custom Rust lexical scanner. Retain its upstream license files and
notices when redistributing dependency sources.

## Customer retail arithmetic (2026-10-29)

Checked retail calculations directly use unmodified `num-bigint` 0.4.8,
`num-rational` 0.4.2 and `num-traits` 0.2.19 from the Rust Num project:
https://github.com/rust-num/num-bigint,
https://github.com/rust-num/num-rational and
https://github.com/rust-num/num-traits. Their pinned source manifests declare
MIT OR Apache-2.0. Retain each crate's upstream license files when
redistributing dependency sources. These crates already existed transitively;
the Core crate now declares the dependencies it directly consumes. Exact
integer/rational intermediates avoid overflowing `u128` across the supported
USD rate and usage quantity range; only the final total is rounded.

## Customer usage CSV export (2026-10-29)

Customer challenge and upstream credential encryption directly use the already resolved `ring` 0.17.14
library; retain its bundled license and notices with redistributed sources.
Email syntax validation uses unmodified `email_address` 0.2.9 by Simon Johnston,
licensed MIT, from https://github.com/johnstonskj/rust-email_address. Its existing
resolved version remains unchanged; retain its upstream license on redistribution.

The API directly uses unmodified `csv` 1.4.0 and transitive `csv-core` 0.1.13
from https://github.com/BurntSushi/rust-csv. Their pinned manifests declare
Unlicense/MIT; redistribution may use the MIT terms. Attribution: Copyright
(c) 2015 Andrew Gallant. Retain the crates' upstream license files when
redistributing dependency sources. CSV quoting and record encoding use this
library; spreadsheet formula escaping is applied before writing customer data.

## UI dependencies

The previous Vue/PrimeVue frontend was removed in favor of the React foundation
from `satnaing/shadcn-admin`. The imported baseline is MIT licensed and was taken
from PR 311 commit `95b8f5ae470f48ec6da862dbc76ba1b7deb73ccc`:
https://github.com/satnaing/shadcn-admin/tree/95b8f5ae470f48ec6da862dbc76ba1b7deb73ccc
The repository's `web/` copy is modified for Ovload routes, bilingual resources,
and the procedural homepage scene. Its upstream `web/LICENSE` is retained.

The monitoring preview adapts the free `Number Ticker 01` component distributed
through the Shadcn Space registry. Source:
https://shadcnspace.com/components/number-ticker. The local copy adds locale
formatting, value updates, accessibility metadata, reduced-motion behavior, and
tests. It does not include Shadcn Space branding or paid resources.

Shadcn Space Free License terms applicable to that component:

```text
Copyright (c) 2026 Shadcn Space

Our UI materials are free to use.

You are free to use these components and templates in personal projects,
commercial projects, and client work. You can also share or distribute them if
needed.

You can download and use the templates or components, copy the code, change or
edit it for your needs, share it with others, use it in personal or commercial
projects, and sell projects that are built using this code. You do not need
special permission for any of the above.

You must not scam anyone using the Shadcn Space name, pretend the components are
your original product, use the Shadcn Space brand, logo, or name as your own, or
misuse or misrepresent Shadcn Space intellectual property.

If you copy or share the software, you must include this copyright notice and
license text in all copies or important parts of the software.

This software is provided "as is" with no guarantees or promise that everything
will work perfectly. You use it at your own risk. Shadcn Space is not responsible
for bugs, data loss, project issues, or damage caused by using the software.
```

Reviewed 2026-09-26. Full license agreement:
https://shadcnspace.com/license

Three.js 0.186.0 is an unmodified runtime dependency used to render the procedural
homepage particle scene. Source: https://github.com/mrdoob/three.js. License: MIT,
copyright 2010-2026 three.js authors. The package license is distributed in
`web/node_modules/three/LICENSE` during development and remains applicable to
redistributed copies. `@types/three` 0.186.0 is an unmodified development-only MIT
declaration package, copyright Microsoft Corporation.
GSAP 3.15.0 is an unmodified, pinned dependency for the proposed public homepage
animation. Source: https://github.com/greensock/GSAP.
Package: https://www.npmjs.com/package/gsap/v/3.15.0.
License: GSAP Standard "No Charge" License, https://gsap.com/standard-license/.
Reviewed on 2026-09-19; the license page states an effective date of 2025-04-30
and a last-modified date of 2025-05-30. It permits use in websites and web
applications, including commercial use, and restricts competing visual animation
builders. The intended use here is the gateway homepage illustration.
GSAP retains its own license and must not be relabeled MIT or LGPL. Preserve its
proprietary notices when bundling or distributing it. The package metadata and
source headers link to the license; it contains no standalone license file.
The installed runtime has no additional package dependencies or lifecycle scripts.

Original package attribution:

```text
GSAP 3.15.0
https://gsap.com
@license Copyright 2008-2026, GreenSock. All rights reserved.
Subject to the terms at https://gsap.com/standard-license
@author: Jack Doyle, jack@greensock.com
```

PrimeVue 4.5.5 and @primeuix/themes 1.2.5: MIT, PrimeTek Informatics.
Source: https://github.com/primefaces/primevue and https://github.com/primefaces/primeuix.
Used as unmodified package dependencies; their license files ship in installed packages.
New major versions require a fresh license review.

### PrimeVue license

The MIT License (MIT)

Copyright (c) 2018-2025 PrimeTek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### PrimeUI themes license

MIT License

Copyright (c) 2025 PrimeTek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Typography, localization, icons, and charts

The following are unmodified package dependencies. Fonts are self-hosted and retain their original names and OFL terms. ECharts serves the React gateway Dashboard preview. Vue-ECharts is retained here as historical attribution for the removed Vue catalog; it is no longer a runtime dependency.

### @fontsource-variable/inter 5.3.0

License: OFL-1.1. Source/package: https://www.npmjs.com/package/@fontsource-variable/inter

#### LICENSE

```text
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter-Italic[opsz,wght].ttf: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

### @fontsource-variable/noto-sans-sc 5.3.0

License: OFL-1.1. Source/package: https://www.npmjs.com/package/@fontsource-variable/noto-sans-sc

#### LICENSE

```text
Google Inc.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

### vue-i18n 11.4.12

License: MIT. Source/package: https://www.npmjs.com/package/vue-i18n

#### LICENSE

```text
The MIT License (MIT)

Copyright (c) 2020 kazuya kawaguchi

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### primelocale 2.5.0

License: MIT. Source/package: https://www.npmjs.com/package/primelocale

#### LICENSE

```text
MIT License

Copyright (c) 2023 PrimeTek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### echarts 6.1.0

License: Apache-2.0. Source/package: https://www.npmjs.com/package/echarts

#### LICENSE

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.





========================================================================
Apache ECharts Subcomponents:

The Apache ECharts project contains subcomponents with separate copyright
notices and license terms. Your use of the source code for these
subcomponents is also subject to the terms and conditions of the following
licenses.

BSD 3-Clause (d3.js):
The following files embed [d3.js](https://github.com/d3/d3) BSD 3-Clause:
    `/src/chart/treemap/treemapLayout.ts`,
    `/src/chart/tree/layoutHelper.ts`,
    `/src/chart/graph/forceHelper.ts`,
    `/src/util/number.ts`
See `/licenses/LICENSE-d3` for details of the license.
```

#### NOTICE

```text
Apache ECharts
Copyright 2017-2026 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (https://www.apache.org/).
```

### vue-echarts 8.3.0

License: MIT. Source/package: https://www.npmjs.com/package/vue-echarts

#### LICENSE

```text
The MIT License (MIT)

Copyright (c) 2016-present GU Yiling & ECOMFE

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### @lucide/vue 1.47.0

License: ISC. Source/package: https://www.npmjs.com/package/@lucide/vue

#### LICENSE

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Vue Router 4.6.4

Source: https://github.com/vuejs/router. Unmodified MIT package dependency.

```text
The MIT License (MIT)

Copyright (c) 2019-present Eduardo San Martin Morote

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Documentation references

The organization of project development documentation was informed by
codex-proxy-rs at inspected
documentation revision `0ceac908f45a4c61c3da32c42e9716c087cb3390`:
https://github.com/zyycn/codex-proxy-rs/tree/0ceac908f45a4c61c3da32c42e9716c087cb3390
Ovload's guides are rewritten for its own source ownership, React/shadcn-admin interface and
authorization rules; upstream Vue/theme/tooling requirements were not adopted.
This is the inspected documentation reference, not a claim about the exact
revision of the user-supplied backend source. The imported backend's Apache-2.0
license remains in `src/LICENSE-APACHE`.

Repository-local agent rules and imported skills have been removed. The GSAP
runtime package license and attribution remain documented in the UI dependency
section above.

## react-markdown

The announcement preview uses react-markdown 10.1.0 (MIT),
https://github.com/remarkjs/react-markdown. Upstream license notices are retained
in the installed package and its transitive dependency packages. Raw HTML is not
processed and remote images are disabled in announcement previews.

## Shadcn Space calendar-05

The month/year select calendar in
`web/src/components/shadcn-space/calendar/calendar-05.tsx` is adapted from
https://shadcnspace.com/r/calendar-05.json (retrieved 2026-10-05).
It uses the Shadcn Space Free License reproduced above. The adaptation reuses
existing primitives, supports controlled values and localizes the calendar.

## Shadcn Space Tabs 06

The website settings navigation in `web/src/components/shadcn-space/tabs/tabs-06.tsx`
is adapted from https://shadcnspace.com/r/tabs-06.json (retrieved 2026-10-08).
It uses the Shadcn Space Free License reproduced above. The adaptation adds
controlled items, localization, responsive keyboard orientation, scoped animation
identifiers and reduced-motion support, and removes the demonstration content.

## Shadcn Space Switch 07

The labeled switch in `web/src/components/shadcn-space/switch/switch-07.tsx`
was installed from https://shadcnspace.com/r/switch-07.json and adapted for
localization, accessible labels and reduced motion. It uses the Shadcn Space
Free License reproduced above; existing Shadcn Space attribution applies.

## Shadcn Space Button Group 11

The confirmation selector in `web/src/components/shadcn-space/button-group/button-group-11.tsx` is adapted from https://shadcnspace.com/r/button-group-11.json (retrieved 2026-10-09). It uses the Shadcn Space Free License reproduced above. The adaptation uses controlled confirmation options, translated labels, scoped spring animation, and reduced-motion support. The shared ButtonGroup primitive is adapted from the shadcn/ui registry and retains the existing shadcn/ui MIT attribution.
