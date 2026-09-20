<#
    Produces the Stage 2 acceptance specimen by driving MICROSOFT WORD ITSELF.

    WHY THIS EXISTS AND WHAT IT IS NOT. Every other DOCX fixture in this
    repository is written by the `docx` npm package, some with hand-authored
    OOXML spliced in. Those pin the extraction contract, but they are not
    evidence about real Word output: Word emits parts and attributes no library
    writer produces -- styles.xml with its own style ids, numbering.xml with
    real abstract numbering, a separate footnotes part, rsid tracking, and
    revision marks written the way Word writes them.

    This script does not GENERATE a .docx. It opens Word through COM, types
    into a document, and asks Word to save it. Word's own writer serialises the
    OOXML, so the bytes are Word's.

    Requires Microsoft Word on the machine (developed against Word 16.0).
    Run:  powershell -ExecutionPolicy Bypass -File scripts/fixtures/make-word-authored-docx.ps1

    The output is COMMITTED. Tests read the committed bytes, so a different
    Word build later cannot silently move the expected text.
#>

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $repo 'lib\infra\knowledge\fixtures\docx'
$outPath = Join-Path $outDir 'word-authored.docx'
if (-not (Test-Path $outDir)) { throw "fixture directory missing: $outDir" }
if (Test-Path $outPath) { Remove-Item $outPath -Force }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
    $doc = $word.Documents.Add()
    $sel = $word.Selection

    # --- A heading, so heading resolution runs against Word's OWN styles.xml.
    $sel.Style = $doc.Styles.Item('Heading 1')
    $sel.TypeText('Tidewater loom manual')
    $sel.TypeParagraph()

    $sel.Style = $doc.Styles.Item('Normal')
    $sel.TypeText('The tidewater warping procedure keeps tension even across the back beam.')
    $sel.TypeParagraph()

    # --- A FOOTNOTE, in Word's own separate footnotes part.
    $sel.Style = $doc.Styles.Item('Heading 2')
    $sel.TypeText('Sett and reed')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    $sel.TypeText('For 8/2 cotton the recommended sett is twenty ends per inch.')
    # Anchor the footnote to an EXPLICIT collapsed range at the end of this
    # sentence. Passing $sel.Range here instead put the reference on a later
    # paragraph, because Footnotes.Add moves the selection into the footnote
    # story and subsequent typing continued from somewhere else.
    $anchor = $doc.Range($doc.Content.End - 1, $doc.Content.End - 1)
    $null = $doc.Footnotes.Add($anchor, '', 'Measured with a sley hook on a four-shaft table loom.')
    # wdSeekMainDocument = 0 -- come back out of the footnote story before
    # typing any more body text.
    $word.ActiveWindow.View.SeekView = 0
    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()

    # --- A MULTI-LEVEL LIST, with Word's real numbering definitions.
    $sel.Style = $doc.Styles.Item('Heading 2')
    $sel.TypeText('Warping order')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')

    $listStart = $doc.Content.End
    $sel.TypeText('Wind the warp')
    $sel.TypeParagraph()
    $sel.TypeText('Measure the lease')
    $sel.TypeParagraph()
    $sel.TypeText('Cross the ends')
    $sel.TypeParagraph()
    $sel.TypeText('Beam it on')
    $sel.TypeParagraph()
    $listEnd = $doc.Content.End

    $listRange = $doc.Range($listStart, $listEnd)
    # wdOutlineNumberGallery = 3; template 1 is the plain 1. / a. / i. outline.
    $template = $word.ListGalleries.Item(3).ListTemplates.Item(1)
    $listRange.ListFormat.ApplyListTemplate($template, $false)
    # Indent the middle two so the list is genuinely NESTED, not four flat items.
    $doc.Paragraphs.Item($doc.Paragraphs.Count - 3).Range.ListFormat.ListIndent()
    $doc.Paragraphs.Item($doc.Paragraphs.Count - 2).Range.ListFormat.ListIndent()

    # The Selection object goes stale across list operations, so it is
    # re-acquired rather than reused.
    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    $tail = $doc.Paragraphs.Item($doc.Paragraphs.Count)
    $tail.Range.ListFormat.RemoveNumbers()
    $tail.Range.Style = $doc.Styles.Item('Normal')

    # --- A TABLE, written by Word's table serialiser.
    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    $sel.Style = $doc.Styles.Item('Heading 2')
    $sel.TypeText('Yarn table')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')

    $table = $doc.Tables.Add($sel.Range, 3, 2)
    $table.Cell(1, 1).Range.Text = 'Yarn'
    $table.Cell(1, 2).Range.Text = 'Sett'
    $table.Cell(2, 1).Range.Text = '8/2 cotton'
    $table.Cell(2, 2).Range.Text = '20 epi'
    $table.Cell(3, 1).Range.Text = '16/2 linen'
    $table.Cell(3, 2).Range.Text = '30 epi'

    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()
    $sel.TypeText('Beam the warp under even tension before threading the heddles.')
    $sel.TypeParagraph()

    # --- The sentence the tracked changes will be applied to.
    #
    # Typed in three parts so the word to be deleted has a range captured by
    # position, which is what the deletion below acts on.
    $sel.TypeText('The tidewater sett is ')
    $wordStart = $doc.Content.End - 1
    $sel.TypeText('rarely ')
    $wordEnd = $doc.Content.End - 1
    $sel.TypeText('twenty ends per inch.')
    $sel.TypeParagraph()

    # --- TRACKED CHANGES, recorded by Word and deliberately NOT accepted.
    #
    # The point of this pair is the w:delText trap: a naive all-text-node walk
    # yields "is rarely usually twenty", a fluent sentence asserting the
    # opposite of what the author left behind.
    $doc.TrackRevisions = $true

    # The deletion is made against a range captured while typing, not via
    # Find.Execute: through PowerShell's late binding, Execute ignores the
    # Find properties set above and matches nothing.
    $deleteRange = $doc.Range($wordStart, $wordEnd)
    if ($deleteRange.Text -notmatch 'rarely') {
        throw "captured range was '$($deleteRange.Text)', expected the word to delete"
    }
    $deleteRange.Delete() | Out-Null

    # A second, separate insertion so an insertion exists that is not part of a
    # replacement -- the two are different revision shapes in the XML.
    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    $sel.TypeText('Check the tension again after the first pick.')

    $doc.TrackRevisions = $false

    if ($doc.Revisions.Count -lt 2) {
        throw "expected at least one insertion and one deletion; Word recorded $($doc.Revisions.Count) revision(s)"
    }

    # SELF-CHECKS, because a fixture that is quietly wrong is worse than none.
    # An earlier run anchored the footnote to the 'Yarn table' HEADING, which
    # looked like an extraction defect until the XML was read.
    $refParagraph = $doc.Footnotes.Item(1).Reference.Paragraphs.Item(1).Range.Text
    if ($refParagraph -notmatch 'twenty ends per inch') {
        throw "footnote is anchored to the wrong paragraph: '$refParagraph'"
    }
    if ($doc.Tables.Count -ne 1) { throw "expected 1 table, found $($doc.Tables.Count)" }
    if ($doc.Footnotes.Count -ne 1) { throw "expected 1 footnote, found $($doc.Footnotes.Count)" }

    # wdFormatXMLDocument = 12
    $doc.SaveAs([string]$outPath, 12)

    $insertions = 0
    $deletions = 0
    foreach ($rev in $doc.Revisions) {
        # wdRevisionInsert = 1, wdRevisionDelete = 2
        if ($rev.Type -eq 1) { $insertions += 1 }
        elseif ($rev.Type -eq 2) { $deletions += 1 }
    }

    $doc.Close($false)

    [pscustomobject]@{
        path        = $outPath
        bytes       = (Get-Item $outPath).Length
        wordVersion = $word.Version
        insertions  = $insertions
        deletions   = $deletions
    } | ConvertTo-Json
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
