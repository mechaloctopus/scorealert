package com.scorealert.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.scorealert.app.model.Listing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingDetailScreen(listing: Listing?, onBack: () -> Unit) {
    val uri = LocalUriHandler.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Deal detail") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
                }
            )
        },
        floatingActionButton = {
            if (listing != null) ExtendedFloatingActionButton(
                onClick = { uri.openUri(listing.canonicalUrl) },
                icon = { Icon(Icons.Filled.OpenInNew, null) },
                text = { Text("View original") }
            )
        }
    ) { padding ->
        if (listing == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Listing not found")
            }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
            item {
                // Gallery
                val images = listing.imageUrls.ifEmpty { listOfNotNull(listing.primaryImageUrl) }
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    if (images.isEmpty()) {
                        Box(Modifier.fillParentMaxWidth().height(240.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant))
                    } else images.forEach { url ->
                        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.fillParentMaxWidth().height(240.dp))
                    }
                }
            }
            item {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(listing.priceText, fontSize = 34.sp, fontWeight = FontWeight.Black)
                        Spacer(Modifier.weight(1f))
                        listing.score?.let { ScoreBadge(it.overall, it.label) }
                    }
                    Text(listing.itemName, style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(2.dp))
                    Text("${listing.locationLabel} · ${sourceLabel(listing.sourceId)}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant)

                    Spacer(Modifier.height(16.dp))
                    ExtractedFacts(listing)

                    listing.score?.let { score ->
                        if (score.explanation.positives.isNotEmpty()) {
                            Spacer(Modifier.height(16.dp))
                            ReasonBlock("WHY SCOREALERT FLAGGED THIS", score.explanation.positives, "＋",
                                MaterialTheme.colorScheme.primary)
                        }
                        if (score.explanation.watchouts.isNotEmpty()) {
                            Spacer(Modifier.height(12.dp))
                            ReasonBlock("WATCH OUT", score.explanation.watchouts, "－",
                                MaterialTheme.colorScheme.secondary)
                        }
                        Spacer(Modifier.height(16.dp))
                        ScoreBreakdownRow(score)
                    }

                    Spacer(Modifier.height(20.dp))
                    Text("SELLER SAYS", style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(listing.description, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun ExtractedFacts(l: Listing) {
    val facts = buildList {
        l.facts.year?.let { add("Year" to it.toString()) }
        l.facts.mileage?.let { add("Miles" to "%,d".format(it)) }
        if (l.facts.drivetrain != "unknown") add("Drive" to l.facts.drivetrain.uppercase())
        if (l.facts.transmission != "unknown") add("Trans" to l.facts.transmission)
        if (l.facts.titleStatus != "unknown") add("Title" to l.facts.titleStatus)
        if (l.facts.registrationStatus != "unknown") add("Reg" to l.facts.registrationStatus)
    }
    if (facts.isEmpty()) return
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        facts.forEach { (k, v) ->
            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(10.dp)) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    Text(k.uppercase(), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(v, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun ReasonBlock(title: String, items: List<String>, glyph: String, color: androidx.compose.ui.graphics.Color) {
    Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(4.dp))
    items.forEach { Text("$glyph  $it", color = color, style = MaterialTheme.typography.bodyMedium) }
}

@Composable
private fun ScoreBreakdownRow(score: com.scorealert.app.model.Score) {
    val parts = listOf("Price" to score.price, "Fresh" to score.freshness, "Category" to score.category,
        "Condition" to score.condition, "Location" to score.location, "Keyword" to score.keyword)
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text("DEAL-SCORE BREAKDOWN — ${score.overall}/100", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            parts.forEach { (k, v) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(k, Modifier.width(84.dp), style = MaterialTheme.typography.labelMedium)
                    LinearProgressIndicator(
                        progress = { (v / 30f).coerceIn(0f, 1f) },
                        modifier = Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp))
                    )
                    Text("  $v", style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.height(4.dp))
            }
        }
    }
}
