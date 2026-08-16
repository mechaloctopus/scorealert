package com.scorealert.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.scorealert.app.model.Listing
import com.scorealert.app.ui.theme.scoreColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(vm: FeedViewModel, onOpen: (Listing) -> Unit, onOpenSources: () -> Unit) {
    var tab by remember { mutableStateOf(Feed.ALERTS) }
    val listings = vm.filtered(tab)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Radar, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("ScoreAlert", fontWeight = FontWeight.Black)
                    }
                },
                actions = {
                    TextButton(onClick = onOpenSources) { Text("Sources") }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            // Tab strip
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Feed.entries.forEach { f ->
                    FilterChip(
                        selected = tab == f,
                        onClick = { tab = f },
                        label = { Text(f.label) }
                    )
                }
            }
            if (listings.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No listings yet", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(listings, key = { it.id }) { DealCard(it) { onOpen(it) } }
                }
            }
        }
    }
}

/**
 * The two-second deal card. Priority hierarchy: PHOTO > PRICE > ITEM > AGE > SCORE > LOCATION.
 */
@Composable
fun DealCard(listing: Listing, onClick: () -> Unit) {
    val s = listing.score
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column {
            Box {
                AsyncImage(
                    model = listing.primaryImageUrl,
                    contentDescription = listing.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(200.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                )
                if (s != null && s.label != "BELOW") {
                    ScoreBadge(s.overall, s.label, Modifier.align(Alignment.TopEnd).padding(10.dp))
                }
            }
            Column(Modifier.padding(14.dp)) {
                Text(listing.priceText, fontSize = 28.sp, fontWeight = FontWeight.Black,
                    color = MaterialTheme.colorScheme.onSurface)
                Text(listing.itemName, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Meta(listing.locationLabel)
                    Meta(sourceLabel(listing.sourceId))
                    listing.facts.mileage?.let { Meta("${"%,d".format(it)} mi") }
                }
                s?.explanation?.positives?.firstOrNull()?.let {
                    Spacer(Modifier.height(8.dp))
                    Text("“" + summarize(listing) + "”",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun ScoreBadge(score: Int, label: String, modifier: Modifier = Modifier) {
    val c = scoreColor(label)
    Surface(modifier, color = c, shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(labelEmoji(label), fontSize = 14.sp)
            Spacer(Modifier.width(4.dp))
            Text("$score", fontWeight = FontWeight.Black, color = Color.Black)
        }
    }
}

@Composable
private fun Meta(text: String) {
    Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

fun labelEmoji(label: String) = when (label) {
    "SCORE_NOW" -> "🔥"; "GREAT_FIND" -> "⭐"; else -> "•"
}

fun sourceLabel(id: String) = when (id) {
    "facebook" -> "FB Marketplace"; "craigslist" -> "Craigslist"; "offerup" -> "OfferUp"
    "ebay" -> "eBay"; "email" -> "Email alert"; else -> "Shared"
}

/** Short rule/AI summary line. Never fabricates mechanical claims. */
fun summarize(l: Listing): String {
    val bits = mutableListOf<String>()
    when (l.facts.runningStatus) {
        "runs_and_drives" -> bits.add("Runs and drives")
        "runs" -> bits.add("Runs")
        "no_start" -> bits.add("Does not start / parts")
    }
    if (l.facts.issues.isNotEmpty()) bits.add("mentions ${l.facts.issues.first().replace('_', ' ')}")
    if (l.facts.registrationStatus == "current") bits.add("reg current")
    return bits.joinToString(". ").ifBlank { l.description.take(80) }
}
