package com.scorealert.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.scorealert.app.model.HealthResponse
import com.scorealert.app.model.Listing
import com.scorealert.app.net.ScoreAlertApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** UI tabs from the spec. */
enum class Feed(val label: String) {
    ALERTS("Alerts"), HOT("Hot"), FREE("Free"), VEHICLES("Vehicles"),
    MOTORCYCLES("Moto"), BOATS("Boats"), SAVED("Saved")
}

data class FeedState(
    val loading: Boolean = false,
    val listings: List<Listing> = emptyList(),
    val error: String? = null,
)

/**
 * Feed state holder. In this scaffold it seeds from a local sample so the UI is
 * demonstrable without a live backend; wire loadFeed() to a real /feed endpoint next.
 */
class FeedViewModel(private val api: ScoreAlertApi = ScoreAlertApi.create()) : ViewModel() {

    private val _state = MutableStateFlow(FeedState(listings = SampleData.listings))
    val state: StateFlow<FeedState> = _state.asStateFlow()

    private val _health = MutableStateFlow(HealthResponse())
    val health: StateFlow<HealthResponse> = _health.asStateFlow()

    fun filtered(feed: Feed): List<Listing> {
        val all = _state.value.listings.sortedByDescending { it.score?.overall ?: 0 }
        return when (feed) {
            Feed.ALERTS -> _state.value.listings
            Feed.HOT -> all.filter { (it.score?.overall ?: 0) >= 75 }
            Feed.FREE -> all.filter { it.facts.isFree }
            Feed.VEHICLES -> all.filter { it.facts.category in setOf("car", "truck", "van", "suv") }
            Feed.MOTORCYCLES -> all.filter { it.facts.category == "motorcycle" }
            Feed.BOATS -> all.filter { it.facts.category == "boat" }
            Feed.SAVED -> emptyList()
        }
    }

    fun listing(id: String?): Listing? =
        _state.value.listings.firstOrNull { it.id == id }

    fun loadHealth() {
        viewModelScope.launch {
            runCatching { api.getHealth() }.onSuccess { _health.value = it }
        }
    }
}
