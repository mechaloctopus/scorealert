package com.scorealert.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.scorealert.app.model.SourceInfo

/**
 * Admin / diagnostics: makes it very clear what ScoreAlert is actually monitoring
 * automatically vs. what is a manual/email path — straight from the backend register.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourceHealthScreen(vm: FeedViewModel, onBack: () -> Unit) {
    val health by vm.health.collectAsState()
    LaunchedEffect(Unit) { vm.loadHealth() }

    // Fall back to the known register when offline, so the screen is never blank.
    val sources = health.sources.ifEmpty { FALLBACK_SOURCES }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Source health") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }
            )
        }
    ) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(sources, key = { it.id }) { SourceRow(it) }
        }
    }
}

@Composable
private fun SourceRow(s: SourceInfo) {
    Card(shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(healthColor(s.health)))
                Spacer(Modifier.width(8.dp))
                Text(s.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                AssistChip(onClick = {}, label = { Text(if (s.autoCollect) "AUTO" else "MANUAL/EMAIL") })
            }
            Spacer(Modifier.height(6.dp))
            Text(s.policy + " · " + s.health.replace('_', ' '),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Text(s.howItWorks, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun healthColor(health: String): Color = when (health) {
    "healthy" -> Color(0xFF00E5A8)
    "degraded" -> Color(0xFFFFB020)
    "authorization_required" -> Color(0xFFFFB020)
    "policy_blocked" -> Color(0xFFFF3B30)
    else -> Color(0xFF8A97A6)
}

private val FALLBACK_SOURCES = listOf(
    SourceInfo("ebay", "eBay (Browse API)", "OFFICIAL_API", true, "disabled",
        "Polled automatically via the official eBay Browse API."),
    SourceInfo("email", "Email alert ingestion", "EMAIL_ALERT", true, "healthy",
        "Parses your own saved-search alert emails via an inbound webhook."),
    SourceInfo("manual", "Manual / Share Sheet", "USER_PROVIDED", false, "healthy",
        "Tap Share → ScoreAlert from any app."),
    SourceInfo("craigslist", "Craigslist Kauaʻi", "APPROVED_FEED", true, "healthy",
        "Polls Craigslist's own public RSS feed for your Kauaʻi searches (no login)."),
    SourceInfo("facebook", "Facebook Marketplace", "USER_PROVIDED", false, "healthy",
        "Captured by the ScoreAlert userscript in your own browser as you browse."),
    SourceInfo("offerup", "OfferUp", "USER_PROVIDED", false, "healthy",
        "Captured by the ScoreAlert userscript in your own browser as you browse."),
)
