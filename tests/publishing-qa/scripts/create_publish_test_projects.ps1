param(
    [string]$AppDataRoot = (Join-Path $env:APPDATA "WordsMaker9000"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$createdAt = "2026-07-28T12:00:00.000Z"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$devProjectsRoot = Join-Path $AppDataRoot "Dev_Projects"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$qaExpectationsRoot = Join-Path $repoRoot "tests\publishing-qa\expectations"

function Write-Utf8Json {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )
    $json = $Value | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Write-Utf8Text {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )
    [System.IO.File]::WriteAllText($Path, $Value, $utf8NoBom)
}

function Read-QaExpectation {
    param([Parameter(Mandatory = $true)][string]$FileName)
    $path = Join-Path $qaExpectationsRoot $FileName
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Publish QA expectation file not found: $path"
    }
    return [System.IO.File]::ReadAllText($path)
}

function Get-HtmlWordCount {
    param([AllowEmptyString()][string]$Html)
    if ([string]::IsNullOrWhiteSpace($Html)) {
        return 0
    }
    $plain = [regex]::Replace($Html, "<[^>]+>", " ")
    $plain = [System.Net.WebUtility]::HtmlDecode($plain)
    return [regex]::Matches($plain, "[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*").Count
}

function New-NodeSpec {
    param(
        [Parameter(Mandatory = $true)][long]$Id,
        [Parameter(Mandatory = $true)][long]$Parent,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][ValidateSet("file", "folder")][string]$Type,
        [AllowEmptyString()][string]$Content = "",
        [switch]$OmitFile
    )
    return [pscustomobject]@{
        Id = $Id
        Parent = $Parent
        Text = $Text
        Type = $Type
        Content = $Content
        OmitFile = $OmitFile.IsPresent
    }
}

function New-Inclusion {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("all_formats", "selected_formats", "excluded")]
        [string]$Type,
        [string[]]$Formats = @()
    )
    if ($Type -eq "selected_formats") {
        return [ordered]@{
            type = $Type
            formats = @($Formats)
        }
    }
    return [ordered]@{ type = $Type }
}

function New-NodeRole {
    param(
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)]$Inclusion
    )
    return [ordered]@{
        role = $Role
        inclusion = $Inclusion
    }
}

function New-PublishingConfig {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectType,
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Subtitle,
        [Parameter(Mandatory = $true)]$NodeRoles,
        [AllowNull()][string]$FrontMatter,
        [AllowNull()][string]$BackMatter,
        [ValidateSet("valid", "missing", "none")][string]$CoverMode = "valid",
        [bool]$IncludeFrontMatter = $true,
        [bool]$IncludeBackMatter = $true,
        [bool]$UseDerivedIdentifier = $false,
        [ValidateSet("left_to_right", "right_to_left")]
        [string]$PageProgressionDirection = "left_to_right"
    )
    $cover = $null
    if ($CoverMode -ne "none") {
        $coverSource = if ($CoverMode -eq "valid") {
            "qa-cover.svg"
        } else {
            "missing-cover.svg"
        }
        $cover = [ordered]@{
            source = $coverSource
            alt_text = "A navy test cover with a white rocket and the title $Title."
        }
    }
    $identifier = if ($UseDerivedIdentifier) {
        $null
    } else {
        $identifierSlug = ($Title.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
        "urn:wordsmaker9000:publish-qa:$identifierSlug"
    }
    return [ordered]@{
        schema_version = 3
        project_type_strategy = [ordered]@{
            project_type = $ProjectType
            version = 1
            confirmed = $true
        }
        book_metadata = [ordered]@{
            title = $Title
            subtitle = $Subtitle
            author = "Quinn Tester"
            language = "en-US"
            front_matter = $FrontMatter
            back_matter = $BackMatter
            contact = [ordered]@{
                author_name = "Quinn Tester"
                email = "quinn.tester@example.com"
                phone = "+1 555 010 0200"
                mailing_address = "100 Fixture Lane`nTestville, NY 10001"
                header_surname = "Tester"
                short_title = "Publish QA"
            }
            ebook = [ordered]@{
                identifier = $identifier
                publisher = "WordsMaker QA Press"
                description = "A generated fixture for checking WordsMaker9000 PDF, DOCX, and EPUB publishing accuracy."
                rights = "QA fixture — not for distribution."
                cover = $cover
                page_progression_direction = $PageProgressionDirection
                include_front_matter = $IncludeFrontMatter
                include_back_matter = $IncludeBackMatter
            }
        }
        node_roles = $NodeRoles
        profiles = [ordered]@{
            print_interior = [ordered]@{
                trim_size = "six_by_nine"
                top_margin_inches = 0.75
                bottom_margin_inches = 0.75
                inside_margin_inches = 0.75
                outside_margin_inches = 0.625
                gutter_inches = 0.125
                chapter_start = "recto"
                running_headers = $true
                front_matter_page_numbers = $true
                body_page_numbers = $true
            }
        }
        default_profile_by_format = [ordered]@{
            pdf = "proof_pdf"
            docx = "standard_manuscript"
            epub = "reflowable_epub"
        }
    }
}

function New-QaProjectDefinition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Slug,
        [Parameter(Mandatory = $true)][string]$ProjectType,
        [Parameter(Mandatory = $true)][object[]]$Nodes,
        [Parameter(Mandatory = $true)]$PublishingConfig,
        [Parameter(Mandatory = $true)][string]$Guide,
        [ValidateSet("valid", "missing", "none")][string]$CoverMode = "valid"
    )
    return [pscustomobject]@{
        Name = $Name
        Slug = $Slug
        ProjectType = $ProjectType
        Nodes = $Nodes
        PublishingConfig = $PublishingConfig
        Guide = $Guide
        CoverMode = $CoverMode
    }
}

function New-QaProject {
    param([Parameter(Mandatory = $true)]$Definition)

    $projectPath = Join-Path $devProjectsRoot $Definition.Name
    New-Item -ItemType Directory -Path $projectPath | Out-Null

    $storedNodes = @()
    $totalWords = 0
    foreach ($node in $Definition.Nodes) {
        $nodeSuffix = "{0:D3}" -f $node.Id
        $fileId = if ($node.Type -eq "file") {
            "$($Definition.Slug)-$nodeSuffix"
        } else {
            "$($Definition.Slug)-folder-$nodeSuffix"
        }
        $wordCount = if ($node.Type -eq "file") {
            Get-HtmlWordCount -Html $node.Content
        } else {
            0
        }
        $totalWords += $wordCount
        $storedNodes += [ordered]@{
            id = $node.Id
            parent = $node.Parent
            droppable = $true
            text = $node.Text
            data = [ordered]@{
                fileType = $node.Type
                fileName = $node.Text
                fileId = $fileId
                wordCount = $wordCount
                lastModified = $createdAt
                createDate = $createdAt
            }
        }
        if ($node.Type -eq "file" -and -not $node.OmitFile) {
            Write-Utf8Json -Path (Join-Path $projectPath "$fileId.json") -Value ([ordered]@{
                content = $node.Content
            })
        }
    }

    Write-Utf8Json -Path (Join-Path $projectPath "metadata.json") -Value ([ordered]@{
        projectName = $Definition.Name
        lastModified = $createdAt
        createDate = $createdAt
        wordCount = $totalWords
        lastBackedUp = $null
        projectType = $Definition.ProjectType
        treeData = @($storedNodes)
    })
    Write-Utf8Json -Path (Join-Path $projectPath "publishing.json") -Value $Definition.PublishingConfig
    Write-Utf8Text -Path (Join-Path $projectPath "PUBLISH_QA_EXPECTATIONS.md") -Value $Definition.Guide

    if ($Definition.CoverMode -eq "valid") {
        $escapedTitle = [System.Security.SecurityElement]::Escape($Definition.PublishingConfig.book_metadata.title)
        $coverSvg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600" role="img" aria-labelledby="title description">
  <title id="title">$escapedTitle</title>
  <desc id="description">A navy test cover with a white rocket and book title.</desc>
  <rect width="1200" height="1600" fill="#183153"/>
  <text x="600" y="610" text-anchor="middle" font-size="240" fill="#ffffff">🚀</text>
  <text x="600" y="880" text-anchor="middle" font-size="58" fill="#ffffff">$escapedTitle</text>
  <text x="600" y="980" text-anchor="middle" font-size="36" fill="#b9d7ff">WordsMaker9000 Publish QA</text>
</svg>
"@
        Write-Utf8Text -Path (Join-Path $projectPath "qa-cover.svg") -Value $coverSvg
    }
}

$guidePrefix = @'
This file is excluded from every output. Read docs/PUBLISH_QA_EXPECTATIONS.md in the WordsMaker9000 source checkout for the complete checklist.
'@

$novelNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Prologue — Root File" -Type file -Content @'
<h1>Prologue</h1><p>The root-file prologue should compile directly as a chapter with this title—not as a duplicate “Chapter 1” wrapper.</p><p>Rain silvered the platform. <strong>Mara held the last ticket</strong>, <em>creased twice</em>, while the clock refused to move.</p><p class="ql-align-center">#</p><p>This is an untitled second scene inside the same source file.</p><p>***</p><p>This is the third scene, following an asterisk separator.</p>
'@
    )
    (New-NodeSpec -Id 2 -Parent 0 -Text "Chapter One — The Arrival" -Type folder)
    (New-NodeSpec -Id 3 -Parent 2 -Text "Scene 1 — Station" -Type file -Content @'
<h2>Station Heading</h2><p>Plain “smart quotes,” an em dash — and café accents should survive.</p><p><strong>Bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s>, and <strong><em><u><s>all four marks</s></u></em></strong>.</p><p>Soft line one<br>Soft line two.</p><blockquote><p>The departure board whispered, “NOT YET.”</p></blockquote>
'@
    )
    (New-NodeSpec -Id 4 -Parent 2 -Text "Scene 2 — Letter" -Type file -Content @'
<p>Mara opened the letter. Read the <a href="https://example.com/publish-qa?format=all&amp;case=links">external QA link</a> in EPUB and DOCX.</p><ol><li data-list="ordered"><span class="ql-ui"></span>First ordered item</li><li data-list="ordered"><span class="ql-ui"></span>Second ordered item</li><li class="ql-indent-1" data-list="bullet"><span class="ql-ui"></span>Nested bullet A</li><li class="ql-indent-1" data-list="bullet"><span class="ql-ui"></span>Nested bullet B</li><li data-list="bullet"><span class="ql-ui"></span>Final top-level bullet</li></ol>
'@
    )
    (New-NodeSpec -Id 5 -Parent 0 -Text "Interlude — EPUB Only" -Type file -Content @'
<p>FORMAT SENTINEL: EPUB-ONLY-INTERLUDE. This sentence must appear in EPUB and must not appear in PDF or DOCX.</p>
'@
    )
    (New-NodeSpec -Id 6 -Parent 0 -Text "Part Two — Below" -Type folder)
    (New-NodeSpec -Id 7 -Parent 6 -Text "Chapter Two — Descent" -Type folder)
    (New-NodeSpec -Id 8 -Parent 7 -Text "Scene 1 — Stairwell" -Type file -Content @'
<p class="ql-align-justify ql-indent-1">This justified, indented paragraph tests paragraph styling through a deeply nested chapter.</p><p class="ql-direction-rtl ql-align-right" dir="rtl">مرحبا بالعالم — هذا سطر لاختبار اتجاه النص.</p>
'@
    )
    (New-NodeSpec -Id 9 -Parent 7 -Text "Sequence — Under the City" -Type folder)
    (New-NodeSpec -Id 10 -Parent 9 -Text "Scene 2 — Chamber" -Type file -Content @'
<p>DEPTH SENTINEL: FOUR-LEVEL-CHAMBER. This text proves traversal reached the deepest file in visible tree order.</p><hr><p>The prose after the semantic horizontal rule is another scene.</p>
'@
    )
    (New-NodeSpec -Id 11 -Parent 0 -Text "Chapter Three — Empty" -Type folder)
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$novelRoles = [ordered]@{
    "5" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type selected_formats -Formats @("epub")))
    "6" = (New-NodeRole -Role "part" -Inclusion (New-Inclusion -Type all_formats))
    "7" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type all_formats))
    "9" = (New-NodeRole -Role "scene" -Inclusion (New-Inclusion -Type all_formats))
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$novelGuide = Read-QaExpectation "01-novel-structure.md"

$novellaNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Chapter One — Small Weather" -Type file -Content @'
<p>NOVELLA-CHAPTER-ONE. This root file should be a single chapter carrying its real title.</p><p class="ql-align-center">#</p><p>A second implicit scene follows the hash.</p><p>* * *</p><p>A third implicit scene follows spaced asterisks.</p>
'@
    )
    (New-NodeSpec -Id 2 -Parent 0 -Text "Chapter Two — The Measure" -Type file -Content @'
<p>NOVELLA-CHAPTER-TWO. There must be no synthetic sibling named “Chapter 2.”</p>
'@
    )
    (New-NodeSpec -Id 3 -Parent 0 -Text "Epilogue — Intentionally Empty" -Type file -Content "")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$novellaRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$novellaGuide = Read-QaExpectation "02-novella-root-chapters.md"

$collectionNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "The Clockmaker’s Map" -Type folder)
    (New-NodeSpec -Id 2 -Parent 1 -Text "Opening — The Shop" -Type file -Content "<p>COLLECTION-WORK-ONE-OPENING. Brass planets revolved above the counter.</p>")
    (New-NodeSpec -Id 3 -Parent 1 -Text "Ending — North" -Type file -Content "<p>COLLECTION-WORK-ONE-ENDING. The map pointed beyond the printed edge.</p>")
    (New-NodeSpec -Id 4 -Parent 0 -Text "A Very Short Story" -Type file -Content "<p>COLLECTION-WORK-TWO. The complete story fits in one root file and must be called a work, never Chapter 1.</p>")
    (New-NodeSpec -Id 5 -Parent 0 -Text "Letters from Europa" -Type folder)
    (New-NodeSpec -Id 6 -Parent 5 -Text "Section A — Orbit" -Type folder)
    (New-NodeSpec -Id 7 -Parent 6 -Text "Scene — The Reply" -Type file -Content "<p>COLLECTION-WORK-THREE-DEEP-SCENE. Καλημέρα, Europa.</p>")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$collectionRoles = [ordered]@{
    "6" = (New-NodeRole -Role "scene" -Inclusion (New-Inclusion -Type all_formats))
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$collectionGuide = Read-QaExpectation "03-collection-scopes.md"

$serialNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Volume One — The Signal Cycle" -Type folder)
    (New-NodeSpec -Id 2 -Parent 1 -Text "Installment 01 — Signal" -Type folder)
    (New-NodeSpec -Id 3 -Parent 2 -Text "Chapter 01 — Broadcast" -Type folder)
    (New-NodeSpec -Id 4 -Parent 3 -Text "Scene 1 — Receiver" -Type file -Content "<p>SERIAL-V1-I1-C1-S1. The receiver woke before its operator.</p>")
    (New-NodeSpec -Id 5 -Parent 3 -Text "Scene 2 — Answer" -Type file -Content "<p>SERIAL-V1-I1-C1-S2. A voice answered from tomorrow.</p>")
    (New-NodeSpec -Id 6 -Parent 1 -Text "Installment 02 — Static" -Type folder)
    (New-NodeSpec -Id 7 -Parent 6 -Text "Chapter 01 — White Noise" -Type folder)
    (New-NodeSpec -Id 8 -Parent 7 -Text "Scene 1 — Pattern" -Type file -Content "<p>SERIAL-V1-I2-C1-S1. The static resolved into a map.</p>")
    (New-NodeSpec -Id 9 -Parent 0 -Text "Holiday Special — Snow Frequency" -Type file -Content "<p>SERIAL-HOLIDAY-SPECIAL. A root file is an installment with direct prose.</p>")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$serialRoles = [ordered]@{
    "1" = (New-NodeRole -Role "volume" -Inclusion (New-Inclusion -Type all_formats))
    "2" = (New-NodeRole -Role "installment" -Inclusion (New-Inclusion -Type all_formats))
    "3" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type all_formats))
    "6" = (New-NodeRole -Role "installment" -Inclusion (New-Inclusion -Type all_formats))
    "7" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type all_formats))
    "9" = (New-NodeRole -Role "installment" -Inclusion (New-Inclusion -Type all_formats))
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$serialGuide = Read-QaExpectation "04-serial-scopes.md"

$inclusionNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "All Formats" -Type file -Content "<p>FORMAT-SENTINEL-ALL. This appears in PDF, DOCX, and EPUB.</p>")
    (New-NodeSpec -Id 2 -Parent 0 -Text "PDF Only" -Type file -Content "<p>FORMAT-SENTINEL-PDF-ONLY. This appears only in PDF.</p>")
    (New-NodeSpec -Id 3 -Parent 0 -Text "DOCX Only" -Type file -Content "<p>FORMAT-SENTINEL-DOCX-ONLY. This appears only in DOCX.</p>")
    (New-NodeSpec -Id 4 -Parent 0 -Text "EPUB Only" -Type file -Content "<p>FORMAT-SENTINEL-EPUB-ONLY. This appears only in EPUB.</p>")
    (New-NodeSpec -Id 5 -Parent 0 -Text "Excluded Everywhere" -Type file -Content "<p>FORMAT-SENTINEL-EXCLUDED. This must never appear.</p>")
    (New-NodeSpec -Id 6 -Parent 0 -Text "Empty Included Chapter" -Type file -Content "")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$inclusionRoles = [ordered]@{
    "1" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type all_formats))
    "2" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type selected_formats -Formats @("pdf")))
    "3" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type selected_formats -Formats @("docx")))
    "4" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type selected_formats -Formats @("epub")))
    "5" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type excluded))
    "6" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type all_formats))
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$inclusionGuide = Read-QaExpectation "05-format-inclusion.md"

$formattingNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Formatting Laboratory" -Type file -Content @'
<h1>Heading One</h1><h2>Heading Two</h2><h3>Heading Three</h3><h4>Heading Four</h4><h5>Heading Five</h5><h6>Heading Six</h6><p>XML characters: fish &amp; chips, 3 &lt; 5, “quotes,” apostrophe’s, and emoji 🚀.</p><p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <strong><em><u><s>combined</s></u></em></strong>.</p><p class="ql-align-center">Centered paragraph</p><p class="ql-align-right">Right-aligned paragraph</p><p class="ql-align-justify">Justified paragraph with enough words to make its alignment visually noticeable across the available line width.</p><p class="ql-indent-2">Two-level indented paragraph</p><blockquote><p>A block quotation with <em>emphasis</em> and a <a href="https://example.com/accessibility">live external link</a>.</p></blockquote><ol><li data-list="ordered"><span class="ql-ui"></span>Ordered one</li><li data-list="ordered"><span class="ql-ui"></span>Ordered two</li><li class="ql-indent-1" data-list="bullet"><span class="ql-ui"></span>Nested bullet</li><li class="ql-indent-2" data-list="ordered"><span class="ql-ui"></span>Deep ordered item</li><li data-list="bullet"><span class="ql-ui"></span>Top-level bullet</li></ol><p>Soft break before<br>soft break after.</p><p class="ql-align-center">#</p><p>After scene break.</p>
'@
    )
    (New-NodeSpec -Id 2 -Parent 0 -Text "Unicode and Direction" -Type file -Content @'
<p>Latin: café, naïve, façade, coöperate.</p><p>Greek: Καλημέρα κόσμε.</p><p>Cyrillic: Здравствуй, мир.</p><p>CJK: 你好，世界。こんにちは世界。</p><p class="ql-direction-rtl ql-align-right" dir="rtl">العربية: مرحبًا بالعالم.</p><p class="ql-direction-rtl ql-align-right" dir="rtl">עברית: שלום עולם.</p><p>UNICODE-END-SENTINEL.</p>
'@
    )
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$formattingRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$formattingGuide = Read-QaExpectation "06-formatting-and-unicode.md"

$unsupportedNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Unsupported Table" -Type file -Content "<p>Before the unsupported block.</p><table><tr><td>THIS TABLE MUST NOT BE SILENTLY DROPPED</td></tr></table><p>After the unsupported block.</p>")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$unsupportedRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$unsupportedGuide = Read-QaExpectation "90-unsupported-html.md"

$missingSourceNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Missing Source File" -Type file -Content "" -OmitFile)
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$missingSourceRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$missingSourceGuide = Read-QaExpectation "91-missing-source.md"

$emptyScopeNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Valid but Excluded" -Type file -Content "<p>EMPTY-SCOPE-SENTINEL. This valid prose is deliberately excluded.</p>")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$emptyScopeRoles = [ordered]@{
    "1" = (New-NodeRole -Role "chapter" -Inclusion (New-Inclusion -Type excluded))
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$emptyScopeGuide = Read-QaExpectation "92-empty-scope.md"

$missingCoverNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Valid Ebook Body" -Type file -Content "<p>MISSING-COVER-BODY. This prose is valid; only the configured EPUB cover is missing.</p>")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$missingCoverRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$missingCoverGuide = Read-QaExpectation "93-missing-cover.md"

$definitions = @(
    (New-QaProjectDefinition -Name "Publish QA 01 - Novel Structure" -Slug "publish-qa-01" -ProjectType "novel" -Nodes $novelNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "The Ordered Depths" -Subtitle "Novel Structure Fixture" -NodeRoles $novelRoles -FrontMatter "QA FRONT MATTER — The Ordered Depths. This should appear before body content." -BackMatter "QA BACK MATTER — End of The Ordered Depths." -CoverMode valid) -Guide $novelGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 02 - Novella Root Chapters" -Slug "publish-qa-02" -ProjectType "novella" -Nodes $novellaNodes -PublishingConfig (New-PublishingConfig -ProjectType "novella" -Title "Small Weather" -Subtitle "Root-File Novella Fixture" -NodeRoles $novellaRoles -FrontMatter $null -BackMatter $null -CoverMode none -UseDerivedIdentifier $true) -Guide $novellaGuide -CoverMode none)
    (New-QaProjectDefinition -Name "Publish QA 03 - Collection Scopes" -Slug "publish-qa-03" -ProjectType "collection" -Nodes $collectionNodes -PublishingConfig (New-PublishingConfig -ProjectType "collection" -Title "Three Impossible Maps" -Subtitle "Collection and Scope Fixture" -NodeRoles $collectionRoles -FrontMatter "SHARED COLLECTION FRONT MATTER — include with selected works." -BackMatter "SHARED COLLECTION BACK MATTER — include with selected works." -CoverMode valid) -Guide $collectionGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 04 - Serial Scopes" -Slug "publish-qa-04" -ProjectType "serial" -Nodes $serialNodes -PublishingConfig (New-PublishingConfig -ProjectType "serial" -Title "The Signal Cycle" -Subtitle "Serial, Installment, and Volume Fixture" -NodeRoles $serialRoles -FrontMatter "SHARED SERIAL FRONT MATTER." -BackMatter "SHARED SERIAL BACK MATTER." -CoverMode valid) -Guide $serialGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 05 - Format Inclusion" -Slug "publish-qa-05" -ProjectType "novel" -Nodes $inclusionNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "The Three-Format Ledger" -Subtitle "Format Inclusion Fixture" -NodeRoles $inclusionRoles -FrontMatter "FORMAT FRONT MATTER SENTINEL." -BackMatter "FORMAT BACK MATTER SENTINEL." -CoverMode valid -IncludeFrontMatter $false -IncludeBackMatter $true) -Guide $inclusionGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 06 - Formatting and Unicode" -Slug "publish-qa-06" -ProjectType "novel" -Nodes $formattingNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Glyphs & Garlands" -Subtitle "Formatting, Unicode, and Reflow Fixture" -NodeRoles $formattingRoles -FrontMatter "FORMATTING FIXTURE FRONT MATTER." -BackMatter "FORMATTING FIXTURE BACK MATTER." -CoverMode valid) -Guide $formattingGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 90 - Expected Failure - Unsupported HTML" -Slug "publish-qa-90" -ProjectType "novel" -Nodes $unsupportedNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Unsupported HTML Failure" -Subtitle "Expected Compilation Failure" -NodeRoles $unsupportedRoles -FrontMatter $null -BackMatter $null -CoverMode none) -Guide $unsupportedGuide -CoverMode none)
    (New-QaProjectDefinition -Name "Publish QA 91 - Expected Failure - Missing Source" -Slug "publish-qa-91" -ProjectType "novel" -Nodes $missingSourceNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Missing Source Failure" -Subtitle "Expected Snapshot Failure" -NodeRoles $missingSourceRoles -FrontMatter $null -BackMatter $null -CoverMode none) -Guide $missingSourceGuide -CoverMode none)
    (New-QaProjectDefinition -Name "Publish QA 92 - Expected Failure - Empty Scope" -Slug "publish-qa-92" -ProjectType "novel" -Nodes $emptyScopeNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Empty Scope Failure" -Subtitle "Expected Preflight Failure" -NodeRoles $emptyScopeRoles -FrontMatter $null -BackMatter $null -CoverMode none) -Guide $emptyScopeGuide -CoverMode none)
    (New-QaProjectDefinition -Name "Publish QA 93 - Expected EPUB Failure - Missing Cover" -Slug "publish-qa-93" -ProjectType "novel" -Nodes $missingCoverNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Missing Cover Failure" -Subtitle "Expected EPUB Asset Failure" -NodeRoles $missingCoverRoles -FrontMatter $null -BackMatter $null -CoverMode missing) -Guide $missingCoverGuide -CoverMode missing)
)

New-Item -ItemType Directory -Force -Path $devProjectsRoot | Out-Null
$rootFull = [System.IO.Path]::GetFullPath($devProjectsRoot).TrimEnd("\") + "\"
$collisions = @($definitions | Where-Object { Test-Path -LiteralPath (Join-Path $devProjectsRoot $_.Name) })
if ($collisions.Count -gt 0 -and -not $Force) {
    $names = ($collisions | ForEach-Object { $_.Name }) -join ", "
    throw "Refusing to overwrite existing publish QA projects: $names. Re-run with -Force only if replacement is intended."
}

foreach ($definition in $definitions) {
    $target = Join-Path $devProjectsRoot $definition.Name
    $targetFull = [System.IO.Path]::GetFullPath($target)
    if (-not $targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not $definition.Name.StartsWith("Publish QA ", [System.StringComparison]::Ordinal)) {
        throw "Unsafe fixture target: $targetFull"
    }
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    New-QaProject -Definition $definition
    Write-Output "Created $($definition.Name)"
}

Write-Output ""
Write-Output "Created $($definitions.Count) publish QA projects under:"
Write-Output $devProjectsRoot
