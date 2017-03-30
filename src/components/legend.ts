/**
 * Copyright 2014-present Palantir Technologies
 * @license MIT
 */

import * as d3 from "d3";
import * as Typesetter from "typesettable";

import * as Configs from "../core/config";
import * as Formatters from "../core/formatters";
import { Formatter } from "../core/formatters";
import { SpaceRequest } from "../core/interfaces";
import * as SymbolFactories from "../core/symbolFactories";
import { SymbolFactory } from "../core/symbolFactories";
import * as Scales from "../scales";
import { IScaleCallback } from "../scales/scale";

import { Component } from "./component";
import { makeEnum } from "../utils/makeEnum";

/**
 * A single entry in the legend.
 */
export interface IEntry {
  name: string;
  symbol: SymbolFactory;
  color: string;
  opacity: number;
}

export type IEntryCallback = (entry: IEntry, index: number, entryElement: Element) => void;

export const LegendOrientation = makeEnum(["horizontal", "vertical"]);
export type LegendOrientation = keyof typeof LegendOrientation;

/**
 * A legend displays the series in a chart in a tabular along with that series'
 * symbol and color.
 */
export class Legend extends Component {
  /**
   * The css class applied to each legend entry
   */
  public static LEGEND_ENTRY_CLASS = "legend-entry";
  /**
   * The css class applied to each legend symbol
   */
  public static LEGEND_SYMBOL_CLASS = "legend-symbol";

  /**
   * The css class applied to each legend name
   */
  public static LEGEND_NAME_CLASS = "legend-name";

  private _container: d3.Selection<HTMLDivElement, any, any, any>;
  private _colorScale: Scales.Color;
  private _formatter: Formatter;
  private _comparator: (a: string, b: string) => number;
  private _measurer: Typesetter.Measurer;
  private _onEntryClicked: IEntryCallback;
  private _symbolFactoryAccessor: (datum: any, index: number) => SymbolFactory;
  private _symbolOpacityAccessor: (datum: any, index: number) => number;
  private _redrawCallback: IScaleCallback<Scales.Color>;
  private _orientation: LegendOrientation;

  /**
   * The Legend consists of a series of entries, each with a color and label taken from the Color Scale.
   *
   * @constructor
   * @param {Scale.Color} scale
   */
  constructor(colorScale: Scales.Color, orientation: LegendOrientation = "vertical") {
    super();
    this.addClass("legend");
    this._orientation = orientation;

    if (colorScale == null) {
      throw new Error("Legend requires a colorScale");
    }

    this._colorScale = colorScale;
    this._redrawCallback = (scale) => this.redraw();
    this._colorScale.onUpdate(this._redrawCallback);
    this._formatter = Formatters.identity();
    this.xAlignment("right").yAlignment("top");
    this.comparator((a: string, b: string) => {
      const formattedText = this._colorScale.domain().slice().map((d: string) => this._formatter(d));
      return formattedText.indexOf(a) - formattedText.indexOf(b);
    });
    this._symbolFactoryAccessor = () => SymbolFactories.circle();
    this._symbolOpacityAccessor = () => 1;
  }

  protected _setup() {
    super._setup();
    this._container = this.element().append<HTMLDivElement>("div").classed(Legend.LEGEND_ENTRY_CLASS+"-container", true);

    const context = new Typesetter.HtmlContext(this._container.node(), null, Configs.ADD_TITLE_ELEMENTS);
    // this._measurer = new Typesetter.CacheMeasurer(context);
    this._measurer = new Typesetter.Measurer(context);
  }

  /**
   * Gets the Formatter for the entry texts.
   */
  public formatter(): Formatter;
  /**
   * Sets the Formatter for the entry texts.
   *
   * @param {Formatter} formatter
   * @returns {Legend} The calling Legend.
   */
  public formatter(formatter: Formatter): this;
  public formatter(formatter?: Formatter): any {
    if (formatter == null) {
      return this._formatter;
    }
    this._formatter = formatter;
    this.redraw();
    return this;
  }

  /**
   * Gets this legend's orientation.
   * @returns {LegendOrientation}
   */
  public orientation(): LegendOrientation;
  /**
   * Sets this legend's orientation. A "vertical" legend
   * tries to
   * @param orientation
   */
  public orientation(orientation: LegendOrientation): this;
  public orientation(orientation?: LegendOrientation) {
    if (orientation == null) {
      return this._orientation;
    } else {
      this._orientation = orientation;
      this.redraw();
      return this;
    }
  }

  /**
   * Gets the current comparator for the Legend's entries.
   *
   * @returns {(a: string, b: string) => number}
   */
  public comparator(): (a: string, b: string) => number;
  /**
   * Sets a new comparator for the Legend's entries.
   * The comparator is used to set the display order of the entries.
   *
   * @param {(a: string, b: string) => number} comparator
   * @returns {Legend} The calling Legend.
   */
  public comparator(comparator: (a: string, b: string) => number): this;
  public comparator(comparator?: (a: string, b: string) => number): any {
    if (comparator == null) {
      return this._comparator;
    } else {
      this._comparator = comparator;
      this.redraw();
      return this;
    }
  }

  /**
   * Gets the Color Scale.
   *
   * @returns {Scales.Color}
   */
  public colorScale(): Scales.Color;
  /**
   * Sets the Color Scale.
   *
   * @param {Scales.Color} scale
   * @returns {Legend} The calling Legend.
   */
  public colorScale(colorScale: Scales.Color): this;
  public colorScale(colorScale?: Scales.Color): any {
    if (colorScale != null) {
      this._colorScale.offUpdate(this._redrawCallback);
      this._colorScale = colorScale;
      this._colorScale.onUpdate(this._redrawCallback);
      this.redraw();
      return this;
    } else {
      return this._colorScale;
    }
  }

  public destroy() {
    super.destroy();
    this._colorScale.offUpdate(this._redrawCallback);
  }

  public requestedSpace(offeredWidth: number, offeredHeight: number): SpaceRequest {
    console.log("legend offered", offeredWidth, offeredHeight);
    const entryData = this.getEntryData();
    const entryMeasurements = entryData.map((entry) => (
      this._measurer.measure(entry.name)
    ));
    const maxEntryWidth = Math.max(...entryMeasurements.map((measurement) => {
      const nameWidth = measurement.width;
      // measurement.height is the line height which is 1em; match the CSS 0.6em + 5px margin
      const symbolWidth = measurement.height * 0.6 + 5;
      // match 10px margin in the CSS
      const marginRight = 10;
      console.log(nameWidth, symbolWidth, marginRight, nameWidth + symbolWidth + marginRight);
      return nameWidth + symbolWidth + marginRight;
    }));

    return {
      minWidth: maxEntryWidth,
      minHeight: offeredHeight,
    };
  }

  /**
   * Set the callback that will fire when a particular Legend entry is clicked on.
   */
  public onEntryClicked(callback: IEntryCallback) {
    this._onEntryClicked = callback;
  }

  /**
   * Get all the entry data for this legend, sorted, in a flat array.
   */
  public getEntryData(): IEntry[] {
    const entryNames = this._colorScale.domain().slice().sort((a, b) => {
      return this._comparator(this._formatter(a), this._formatter(b));
    });
    return entryNames.map((name, index) => {
      const entry: IEntry = {
        color: this._colorScale.scale(name),
        name: this._formatter(name),
        opacity: this._symbolOpacityAccessor(name, index),
        symbol: this._symbolFactoryAccessor(name, index),
      };
      return entry;
    });
  }

  public renderImmediately() {
    const data = this.getEntryData();

    const entriesUpdate = this._container.selectAll<HTMLDivElement, IEntry>("." + Legend.LEGEND_ENTRY_CLASS).data(data);
    // delete old entries
    entriesUpdate.exit().remove();

    const entriesEnter =
      entriesUpdate
        .enter()
        .append<HTMLDivElement>("div")
          .classed(Legend.LEGEND_ENTRY_CLASS, true);

    // use 100x100 viewbox in SVG and then scale it to font-size in the CSS
    const SVG_VIEWBOX_SIZE = 100;

    // create DOM for marker
    entriesEnter
      .append("svg")
        .classed(Legend.LEGEND_SYMBOL_CLASS, true)
        .attr("viewBox", `0 0 ${ SVG_VIEWBOX_SIZE } ${ SVG_VIEWBOX_SIZE }`)
      .append("path")
        .attr("transform", `translate(${ SVG_VIEWBOX_SIZE / 2 } ${ SVG_VIEWBOX_SIZE / 2 })`);

    // create DOM for name
    entriesEnter
      .append("span")
        .classed(Legend.LEGEND_NAME_CLASS, true);

    const entries = entriesEnter.merge(entriesUpdate);
    entries.each(function (entry, index) {
      const entryDiv = d3.select(this);

      entryDiv
        .select(`.${Legend.LEGEND_SYMBOL_CLASS} path`)
        .attr("d", entry.symbol(SVG_VIEWBOX_SIZE))
        .attr("fill", entry.color)
        .attr("opacity", entry.opacity);

      entryDiv
        .select("." + Legend.LEGEND_NAME_CLASS)
          .text(entry.name);
    });
    const self = this;
    entries.on("click", function(datum, index) {
      if (self._onEntryClicked != null) {
        self._onEntryClicked(datum, index, this);
      }
    });
    return this;
  }

  /**
   * Gets the function determining the symbols of the Legend.
   *
   * @returns {(datum: any, index: number) => symbolFactory}
   */
  public symbol(): (datum: any, index: number) => SymbolFactory;
  /**
   * Sets the function determining the symbols of the Legend.
   *
   * @param {(datum: any, index: number) => SymbolFactory} symbol
   * @returns {Legend} The calling Legend
   */
  public symbol(symbol: (datum: any, index: number) => SymbolFactory): this;
  public symbol(symbol?: (datum: any, index: number) => SymbolFactory): any {
    if (symbol == null) {
      return this._symbolFactoryAccessor;
    } else {
      this._symbolFactoryAccessor = symbol;
      this.render();
      return this;
    }
  }

  /**
   * Gets the opacity of the symbols of the Legend.
   *
   * @returns {(datum: any, index: number) => number}
   */
  public symbolOpacity(): (datum: any, index: number) => number;
  /**
   * Sets the opacity of the symbols of the Legend.
   *
   * @param {number | ((datum: any, index: number) => number)} symbolOpacity
   * @returns {Legend} The calling Legend
   */
  public symbolOpacity(symbolOpacity: number | ((datum: any, index: number) => number)): this;
  public symbolOpacity(symbolOpacity?: number | ((datum: any, index: number) => number)): any {
    if (symbolOpacity == null) {
      return this._symbolOpacityAccessor;
    } else if (typeof symbolOpacity === "number") {
      this._symbolOpacityAccessor = () => symbolOpacity;
    } else {
      this._symbolOpacityAccessor = symbolOpacity;
    }
    this.render();
    return this;
  }

  public fixedWidth() {
    return true;
  }

  public fixedHeight() {
    return true;
  }
}
