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
        [object[]]$MatterTemplates = @(),
        [AllowNull()]$MasterPage = $null,
        [AllowNull()]$LargePrintProfile = $null,
        [AllowNull()]$HardcoverProfile = $null,
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
    if ($null -eq $MasterPage) {
        $MasterPage = [ordered]@{
            template_id = "profile_default"
            template_version = 1
        }
    }
    if ($null -eq $LargePrintProfile) {
        $LargePrintProfile = [ordered]@{
            trim_size = "seven_by_ten"
            top_margin_inches = 0.75
            bottom_margin_inches = 0.75
            inside_margin_inches = 0.8
            outside_margin_inches = 0.7
            gutter_inches = 0.15
            base_font_size_points = 16.0
            line_spacing = 1.5
            max_line_length_characters = 50
            heading_scale = 1.5
            paragraph_spacing_points = 6.0
            running_headers = $true
            front_matter_page_numbers = $true
            body_page_numbers = $true
            page_furniture_size_points = 11.0
        }
    }
    if ($null -eq $HardcoverProfile) {
        $HardcoverProfile = [ordered]@{
            trim_size = "six_by_nine"
            top_margin_inches = 0.875
            bottom_margin_inches = 0.875
            inside_margin_inches = 0.875
            outside_margin_inches = 0.75
            gutter_inches = 0.25
            chapter_start = "recto"
            intentional_blank_pages = $true
            running_headers = $true
            front_matter_page_numbers = $true
            body_page_numbers = $true
        }
    }
    return [ordered]@{
        schema_version = 6
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
            large_print = $LargePrintProfile
            hardcover = $HardcoverProfile
        }
        default_profile_by_format = [ordered]@{
            pdf = "proof_pdf"
            docx = "standard_manuscript"
            epub = "reflowable_epub"
        }
        saved_profiles = @()
        matter_templates = @($MatterTemplates)
        master_page = $MasterPage
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
        [object[]]$Assets = @(),
        [ValidateSet("valid", "missing", "none")][string]$CoverMode = "valid"
    )
    return [pscustomobject]@{
        Name = $Name
        Slug = $Slug
        ProjectType = $ProjectType
        Nodes = $Nodes
        PublishingConfig = $PublishingConfig
        Guide = $Guide
        Assets = @($Assets)
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

    if ($Definition.Assets.Count -gt 0) {
        $assetDirectory = Join-Path $projectPath "assets"
        New-Item -ItemType Directory -Path $assetDirectory | Out-Null
        $assetRecords = @()
        foreach ($asset in $Definition.Assets) {
            $encoded = if ($asset.BuiltIn -eq "pixel") {
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            } else {
                $asset.Base64
            }
            $bytes = [Convert]::FromBase64String($encoded)
            $hasher = [System.Security.Cryptography.SHA256]::Create()
            try {
                $sha = ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
            } finally {
                $hasher.Dispose()
            }
            $filename = "$sha.png"
            [System.IO.File]::WriteAllBytes((Join-Path $assetDirectory $filename), $bytes)
            $assetRecords += [ordered]@{
                id = $asset.Id
                display_name = $asset.DisplayName
                relative_path = "assets/$filename"
                media_type = "image/png"
                byte_size = $bytes.Length
                width_px = $asset.Width
                height_px = $asset.Height
                sha256 = $sha
            }
        }
        Write-Utf8Json -Path (Join-Path $projectPath "assets.json") -Value ([ordered]@{
            schema_version = 1
            assets = @($assetRecords)
        })
    }

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
<h1>Heading <strong>One</strong></h1><h2>Heading <a href="https://example.com/heading">Two</a></h2><h3>Heading Three</h3><h4>Heading Four</h4><h5>Heading Five</h5><h6>Heading Six</h6><p>XML characters: fish &amp; chips, 3 &lt; 5, “quotes,” apostrophe’s, and emoji 🚀.</p><p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <strong><em><u><s>combined</s></u></em></strong>.</p><p class="ql-align-center">Centered paragraph</p><p class="ql-align-right">Right-aligned paragraph</p><p class="ql-align-justify">Justified paragraph with enough words to make its alignment visually noticeable across the available line width.</p><p class="ql-indent-2">Two-level indented paragraph</p><blockquote><p>A block quotation with <em>emphasis</em> and a <a href="https://example.com/accessibility">live external link</a>.</p></blockquote><ol><li data-list="ordered"><span class="ql-ui"></span>Ordered one</li><li data-list="ordered"><span class="ql-ui"></span>Ordered two</li><li class="ql-indent-1" data-list="bullet"><span class="ql-ui"></span>Nested bullet</li><li class="ql-indent-2" data-list="ordered"><span class="ql-ui"></span>Deep ordered item</li><li data-list="bullet"><span class="ql-ui"></span>Top-level bullet</li></ol><p>Soft break before<br>soft break after.</p><p>Before semantic scene break.</p><hr class="wm-scene-break" data-wm-scene-break="asterisks" role="separator" aria-label="Scene break"><p>After semantic scene break.</p>
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

$imageAssetId = "asset-qa07-moon"
$imageNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Chapter With Accessible Images" -Type file -Content @"
<p>IMAGE-QA-BEFORE. The informative figure follows this paragraph.</p><figure class="wm-image" data-wm-asset-id="$imageAssetId" data-wm-alt="A white moon above a navy field" data-wm-caption="Moon study — informative image" data-wm-decorative="false" data-wm-image-intent="full_width"><span class="wm-image-placeholder">Image: A white moon above a navy field</span><figcaption>Moon study — informative image</figcaption></figure><p>IMAGE-QA-BETWEEN. The decorative figure follows this paragraph.</p><figure class="wm-image" data-wm-asset-id="$imageAssetId" data-wm-alt="" data-wm-caption="" data-wm-decorative="true" data-wm-image-intent="block"><span class="wm-image-placeholder">Decorative image</span></figure><p>IMAGE-QA-AFTER. Both figures must remain in source order.</p>
"@)
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide — Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$imageRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$imageGuide = Read-QaExpectation "07-accessible-images.md"
$imageAssets = @([pscustomobject]@{
    Id = $imageAssetId
    DisplayName = "qa-moon.png"
    Width = 1
    Height = 1
    BuiltIn = "pixel"
    Base64 = "iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0CAYAAADl5PURAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAOLSURBVHhe7dTLbRtREAVRheE0HIvzj8WGDGhANv8/iTN1LnA2XHBeb+rj1+8/fwGKPuYPABUCCGQJIJAlgECWAAJZAghkCSCQJYBAlgACWQIIZAkgkCWAQJYAAlkCCGQJIJAlgECWAAJZAghkCSCQJYBAlgACWQIIZAkgkCWAQJYAAlkCCGQJIJAlgECWAAJZAghkCSCQJYBAlgACWQIIZAkgkCWAQJYAAlkCCGQJIJAlgECWAAJZAghkCSCQJYBAlgACWQIIZAkgkCWAQJYAAlkCCGQJIJAlgECWAAJZAghkCSCQJYBAlgACWQIIZAkgkCWAQJYA8nKPbP4XPJMA8hKv2PwGPEoAearv2Pwm3EsAeYqf2HwD3EoAecg7bL4JriWA3O2dNt8G1xBAbvbOm2+FcwSQm6xh881wigBytTVtvh2OEUCussbNG2ASQC5a8+YtsEsAuWjNm7fALgHkrC1s3gRfBJCTtrR5G3wSQE7a0uZt8EkAOWqLmzeCAHLUFjdvBAHkwJY3b6VNADmw5c1baRNA9hQ2b6ZLANlT2LyZLgFkT2HzZroEkEVp83aaBJBFafN2mgSQRWnzdpoEkEVp83aaBJBFafN2mgSQRWnzdpoEkEVp83aaBJD/apv30ySALEqbt9MkgCxKm7fTJIAsSpu30ySALEqbt9MkgCxKm7fTJIAsSpu30ySALEqbt9MkgOwpbN5MlwCyp7B5M10CyJ7C5s10CSAHtrx5K20CyIEtb95KmwBy1BY3bwQB5Kgtbt4IAshJW9q8DT4JICdtafM2+CSAnLWFzZvgiwBy0Zo3b4FdAshFa968BXYJIFdZ4+YNMAkgV1vT5tvhGAHkJmvYfDOcIoDc7J033wrnCCB3e6fNt8E1BJCHvMPmm+BaAshT/MTmG+BWAshTfcfmN+FeAshLvGLzG/AoAeTlHtn8L3gmAQSyBBDIEkAgSwCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAIEsAQSyBBDIEkAgSwCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAEEsgQQyBJAIEsAgSwBBLIEEMgSQCBLAIGsf/8HW2CcPEIdAAAAAElFTkSuQmCC"
})

$footnoteNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "First Footnote Chapter" -Type file -Content @'
<p>FOOTNOTE-FIRST-REFERENCE. This note has a lexically later ID<sup class="wm-footnote-reference" data-wm-footnote-id="note-zeta" role="doc-noteref">note</sup>.</p><aside class="wm-footnote-definition" data-wm-footnote-id="note-zeta" data-wm-footnote-body="FIRST-NOTE-BODY -- zeta ID, first in publication order." role="doc-footnote"><strong>Footnote: </strong><span>FIRST-NOTE-BODY -- zeta ID, first in publication order.</span></aside>
'@
    )
    (New-NodeSpec -Id 2 -Parent 0 -Text "Second Footnote Chapter" -Type file -Content @'
<p>FOOTNOTE-SECOND-REFERENCE. This note has a lexically earlier ID<sup class="wm-footnote-reference" data-wm-footnote-id="note-alpha" role="doc-noteref">note</sup>.</p><aside class="wm-footnote-definition" data-wm-footnote-id="note-alpha" data-wm-footnote-body="SECOND-NOTE-BODY -- alpha ID, second in publication order." role="doc-footnote"><strong>Footnote: </strong><span>SECOND-NOTE-BODY -- alpha ID, second in publication order.</span></aside>
'@
    )
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide - Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$footnoteRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$footnoteGuide = Read-QaExpectation "08-footnotes.md"

$templateNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Template Chapter" -Type file -Content "<p>TEMPLATE-BODY-SENTINEL. Ordinary body prose follows every generated front-matter component.</p>")
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide - Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$templateRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$templateMatter = @(
    [ordered]@{ template_id = "title_page"; template_version = 1; variables = [ordered]@{} }
    [ordered]@{ template_id = "copyright"; template_version = 1; variables = [ordered]@{ year = "2026"; holder = "Quinn Tester"; rights_statement = "TEMPLATE-COPYRIGHT-RIGHTS-SENTINEL." } }
    [ordered]@{ template_id = "dedication"; template_version = 1; variables = [ordered]@{ text = "TEMPLATE-DEDICATION-SENTINEL." } }
    [ordered]@{ template_id = "contents"; template_version = 1; variables = [ordered]@{} }
    [ordered]@{ template_id = "acknowledgements"; template_version = 1; variables = [ordered]@{ text = "TEMPLATE-ACKNOWLEDGEMENTS-SENTINEL." } }
    [ordered]@{ template_id = "author_biography"; template_version = 1; variables = [ordered]@{ text = "TEMPLATE-BIOGRAPHY-SENTINEL." } }
    [ordered]@{ template_id = "also_by"; template_version = 1; variables = [ordered]@{ titles = "Earlier Orbit`nLater Orbit" } }
)
$templateMasterPage = [ordered]@{
    template_id = "classic_book"
    template_version = 1
}
$templateGuide = Read-QaExpectation "09-matter-templates.md"

$advancedPrintNodes = @(
    (New-NodeSpec -Id 1 -Parent 0 -Text "Large Type Opening" -Type file -Content @'
<h1>ADVANCED-PRINT-HEADING-SENTINEL</h1><p>ADVANCED-PRINT-FIRST-SENTINEL. This intentionally long paragraph makes the selected large-print measure, body size, line spacing, and paragraph spacing visible during inspection. Every line should remain comfortably readable without clipping into the binding margin, running header, or folio.</p><p>A second paragraph verifies the configured space after paragraphs and keeps enough prose on the page to expose accidental typography regressions.</p><p>The reader followed the path around the harbor until the lamps became a steady constellation. Each doorway held a different story, but the broad type and generous leading kept every sentence distinct. This continuation exists to force a body page after the chapter opening so its running furniture can be inspected.</p><p>At the end of the quay, the map opened across the table. Names, dates, and small observations remained ordinary prose rather than layout instructions. The page should preserve a calm measure with visible space between paragraphs, a clear binding edge, and enough room above and below for navigation furniture.</p><p>Morning brought another set of notes. The editor compared the lines slowly, checking that no word approached the trim edge and that the larger letters did not crowd one another. A continuation page should show the running header and Arabic folio at the configured accessible size.</p><p>Nothing in this fixture names a retailer or promises acceptance by a printer. Its only claim is structural: the selected provider-neutral profile produces the saved page box, typography, margins, headers, folios, and section starts in a deterministic artifact.</p><p>The afternoon review began at the first numbered page and moved forward without skipping a line. On continuation pages, the author name belongs at the outer top edge while the page number remains centered below the text block. Neither element should compete with the prose or disappear into the trim.</p><p>Binding geometry matters most where the reader cannot easily see it. The inside margin and additional gutter must combine before typesetting, leaving a stable reading area on both odd and even pages. Mirroring should move that protected space with the binding edge rather than pinning it to one side.</p><p>Large-print geometry has a different purpose. Its maximum-character setting narrows the measure when the selected page and margins would otherwise produce an overly long line. Because the typeface is proportional, the value is a deterministic estimate and not a literal promise about every individual line.</p><p>The headings remain visibly distinct from body prose without becoming decorative display type. Paragraph spacing supplies another navigation cue, especially for readers who benefit from a clear separation between ideas. These controls should survive a saved workflow, regeneration, and a copied destination artifact.</p><p>A final continuation checks alternating furniture. Even pages should carry the author at the left outer edge; odd continuation pages should carry the title at the right outer edge. Chapter openings remain quiet and omit both running heads and body folios so the hierarchy is immediately apparent.</p><p>After the last review note, the manuscript returns to ordinary narrative. The same sentences should remain selectable text with embedded fonts, not rasterized page images. Search, copy, zoom, and assistive reading workflows depend on preserving that document structure throughout PDF generation.</p><p>The production checklist continues with a deliberate review of the lower margin. Descenders, punctuation, and footnotes must remain above the reserved folio area, even when a paragraph flows close to the page boundary. Automatic pagination should move complete lines instead of squeezing text into unavailable space.</p><p>Next comes the upper margin and running head. The header must remain outside the primary reading area, use the selected furniture size, and alternate according to page parity. An opening-page marker suppresses it only where the structural hierarchy calls for a quiet chapter opening.</p><p>The reviewer then compares consecutive spreads. Protected binding space belongs on the inner edge of each page, so the visible text blocks mirror one another across the gutter. Outside margins remain consistent, and the wider interior allowance never drifts to the trimmed edge.</p><p>Typography is checked again at high zoom and at a whole-page view. Letterforms should remain sharp, Unicode fallback should remain available, and bold or italic emphasis should not alter the intended body size. Headings may scale up, but body paragraphs must stay at the profile's exact base size.</p><p>The final spread confirms continuity. Paragraphs move naturally between pages, the Arabic counter advances once per physical body page, and blank versos do not consume visible furniture. With these observations recorded, the next chapter can begin on its required right-hand page.</p>
'@)
    (New-NodeSpec -Id 2 -Parent 0 -Text "Recto Binding Test" -Type file -Content @'
<p>ADVANCED-PRINT-SECOND-SENTINEL. In Hardcover output this chapter must begin on a right-hand page. Any inserted verso must be intentionally blank, without a running header or folio.</p>
'@)
    (New-NodeSpec -Id 900 -Parent 0 -Text "_QA Guide - Excluded" -Type file -Content "<p>$guidePrefix</p>")
)
$advancedPrintRoles = [ordered]@{
    "900" = (New-NodeRole -Role "unassigned" -Inclusion (New-Inclusion -Type excluded))
}
$advancedLargePrintProfile = [ordered]@{
    trim_size = "eight_by_ten"
    top_margin_inches = 0.875
    bottom_margin_inches = 0.875
    inside_margin_inches = 0.875
    outside_margin_inches = 0.75
    gutter_inches = 0.125
    base_font_size_points = 18.0
    line_spacing = 1.6
    max_line_length_characters = 48
    heading_scale = 1.6
    paragraph_spacing_points = 8.0
    running_headers = $true
    front_matter_page_numbers = $true
    body_page_numbers = $true
    page_furniture_size_points = 12.0
}
$advancedHardcoverProfile = [ordered]@{
    trim_size = "seven_by_ten"
    top_margin_inches = 1.0
    bottom_margin_inches = 1.0
    inside_margin_inches = 0.875
    outside_margin_inches = 0.75
    gutter_inches = 0.375
    chapter_start = "recto"
    intentional_blank_pages = $true
    running_headers = $true
    front_matter_page_numbers = $true
    body_page_numbers = $true
}
$advancedPrintGuide = Read-QaExpectation "10-large-print-and-hardcover.md"

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
    (New-QaProjectDefinition -Name "Publish QA 07 - Accessible Images" -Slug "publish-qa-07" -ProjectType "novel" -Nodes $imageNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "The Moon Registry" -Subtitle "Project Assets and Accessible Images Fixture" -NodeRoles $imageRoles -FrontMatter $null -BackMatter $null -CoverMode valid) -Guide $imageGuide -Assets $imageAssets -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 08 - Footnotes" -Slug "publish-qa-08" -ProjectType "novel" -Nodes $footnoteNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Notes in Orbit" -Subtitle "Native and Semantic Footnotes Fixture" -NodeRoles $footnoteRoles -FrontMatter $null -BackMatter $null -CoverMode valid) -Guide $footnoteGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 09 - Matter Templates" -Slug "publish-qa-09" -ProjectType "novel" -Nodes $templateNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Pages of Record" -Subtitle "Versioned Matter and Master Pages Fixture" -NodeRoles $templateRoles -FrontMatter "LEGACY-FRONT-MATTER-SENTINEL." -BackMatter "LEGACY-BACK-MATTER-SENTINEL." -CoverMode valid -MatterTemplates $templateMatter -MasterPage $templateMasterPage) -Guide $templateGuide -CoverMode valid)
    (New-QaProjectDefinition -Name "Publish QA 10 - Large Print and Hardcover" -Slug "publish-qa-10" -ProjectType "novel" -Nodes $advancedPrintNodes -PublishingConfig (New-PublishingConfig -ProjectType "novel" -Title "Readable Bindings" -Subtitle "Large Print and Hardcover Fixture" -NodeRoles $advancedPrintRoles -FrontMatter "ADVANCED-PRINT-FRONT-SENTINEL." -BackMatter "ADVANCED-PRINT-BACK-SENTINEL." -CoverMode valid -LargePrintProfile $advancedLargePrintProfile -HardcoverProfile $advancedHardcoverProfile) -Guide $advancedPrintGuide -CoverMode valid)
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
