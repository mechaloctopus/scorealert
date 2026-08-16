package com.scorealert.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.NavType

object Routes {
    const val FEED = "feed"
    const val DETAIL = "listing/{id}"
    const val SOURCES = "sources"
    fun detail(id: String) = "listing/$id"
}

@Composable
fun ScoreAlertNavHost(navController: NavHostController, startListingId: String?) {
    val vm: FeedViewModel = viewModel()

    // If launched from a notification deep link, jump straight to the detail screen.
    LaunchedEffect(startListingId) {
        if (!startListingId.isNullOrBlank()) navController.navigate(Routes.detail(startListingId))
    }

    NavHost(navController = navController, startDestination = Routes.FEED) {
        composable(Routes.FEED) {
            FeedScreen(
                vm = vm,
                onOpen = { navController.navigate(Routes.detail(it.id)) },
                onOpenSources = { navController.navigate(Routes.SOURCES) },
            )
        }
        composable(
            Routes.DETAIL,
            arguments = listOf(navArgument("id") { type = NavType.StringType })
        ) { entry ->
            val id = entry.arguments?.getString("id")
            ListingDetailScreen(
                listing = vm.listing(id),
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.SOURCES) {
            SourceHealthScreen(vm = vm, onBack = { navController.popBackStack() })
        }
    }
}
