package com.scorealert.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.navigation.compose.rememberNavController
import com.scorealert.app.net.ScoreAlertApi
import com.scorealert.app.ui.ScoreAlertNavHost
import com.scorealert.app.ui.theme.ScoreAlertTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Single-Activity Compose host. Handles three entry points:
 *   1. Launcher              -> Alert Feed
 *   2. Notification deep link (scorealert://listing/{id}) -> Listing Detail
 *   3. Share Sheet (ACTION_SEND text/image) -> POST /ingest/share, then Feed
 */
class MainActivity : ComponentActivity() {

    // The listing id to open, if launched from a notification deep link.
    private val startListingId = mutableStateOf<String?>(null)

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best effort */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermission()
        handleIntent(intent)

        setContent {
            ScoreAlertTheme {
                val nav = rememberNavController()
                ScoreAlertNavHost(navController = nav, startListingId = startListingId.value)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        when (intent.action) {
            Intent.ACTION_VIEW -> {
                // scorealert://listing/{id}
                startListingId.value = intent.data?.lastPathSegment
            }
            Intent.ACTION_SEND -> ingestShare(intent)
        }
    }

    /** Build a share payload from what the user handed us and post it to the backend. */
    private fun ingestShare(intent: Intent) {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        val url = text?.let { Regex("https?://\\S+").find(it)?.value }
        val payload = mapOf(
            "url" to url,
            "text" to listOfNotNull(subject, text).joinToString("\n"),
            "sharedFrom" to intent.getStringExtra("android.intent.extra.PACKAGE_NAME"),
        )
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { ScoreAlertApi.create().ingestShare(payload) }
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
