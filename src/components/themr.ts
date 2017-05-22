import React, { Component } from 'react'
import PropTypes from 'prop-types'
import hoistNonReactStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import { TTheme } from '../utils/themr-shape'

export type TComposeTheme = 'deeply' | 'softly' | false
export type TMapThemrProps<P> = (ownProps: P, theme: TTheme) => P & {
  theme: TTheme
}
// type TTarget<P, S> = (new (props?: P, context?: any) => React.Component<P, S>) | React.SFC<P>
type TThemrProps<P> = {
  composeTheme?: TComposeTheme,
  themeNamespace?: string,
  theme?: TTheme,
  innerRef?: Function,
  mapThemrProps?: TMapThemrProps<P>
}
type TTarget<P extends TThemrProps<P>> = React.ComponentClass<P> | React.SFC<P>
type TResult<P extends TThemrProps<P>> = React.ComponentClass<P & TThemrProps<P>>

export type TIdentifier = string | number | symbol
export type TThemrOptions<P> = {
  composeTheme: TComposeTheme,
  mapThemrProps: TMapThemrProps<P>
}

const COMPOSE_DEEPLY = 'deeply'
const COMPOSE_SOFTLY = 'softly'
const DONT_COMPOSE = false

const DEFAULT_OPTIONS: TThemrOptions<{}> = {
  composeTheme: COMPOSE_DEEPLY,
  mapThemrProps: defaultMapThemrProps
}

const THEMR_CONFIG = typeof Symbol !== 'undefined' ?
  Symbol('THEMR_CONFIG') :
  '__REACT_CSS_THEMR_CONFIG__'

/**
 * Themr decorator
 * @param {String|Number|Symbol} componentName - Component name
 * @param {TReactCSSThemrTheme} [localTheme] - Base theme
 * @param {{}} [options] - Themr options
 * @returns {function(ThemedComponent:Function):Function} - ThemedComponent
 */
export function themr<OP>(componentName: TIdentifier,
                         localTheme: TTheme = {},
                         options: Partial<TThemrOptions<OP>> = {}) {
  return <P extends TThemrProps<P>>(Target: TTarget<P>): TResult<P> => {
    // const {
    // composeTheme: optionComposeTheme,
    // mapThemrProps: optionMapThemrProps
  // } = { ...DEFAULT_OPTIONS, ...options }
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  }
  const {
    composeTheme,
    mapThemrProps
  } = mergedOptions

  validateComposeOption(composeTheme)

  let config = Target[THEMR_CONFIG]
  if (config && config.componentName === componentName) {
    config.localTheme = themeable(config.localTheme, localTheme)
    return Target as TResult<P>
  }

  config = {
    componentName,
    localTheme
  }

  class Themed extends Component<P, any> {
    static displayName = `Themed${Target.name}`

    static contextTypes = {
      themr: PropTypes.object
    }

    static propTypes = {
      ...(Target as any).propTypes,
      composeTheme: PropTypes.oneOf([ COMPOSE_DEEPLY, COMPOSE_SOFTLY, DONT_COMPOSE ]),
      innerRef: PropTypes.func,
      theme: PropTypes.object,
      themeNamespace: PropTypes.string,
      mapThemrProps: PropTypes.func
    }

    static defaultProps = {
      ...(Target as any).defaultProps,
      composeTheme,
      mapThemrProps
    }

    private theme_: TTheme

    constructor(props: P, context?: any) {
      super(props, context)
      this.theme_ = this.calcTheme(this.props)
    }

    getWrappedInstance() {
      invariant(true,
        'DEPRECATED: To access the wrapped instance, you have to pass ' +
        '{ innerRef: fn } and retrieve with a callback ref style.'
      )

      return this.refs.wrappedInstance
    }

    getNamespacedTheme(props: P): TTheme {
      const { themeNamespace, theme } = props
      if (!themeNamespace || !theme) {
        return theme || {}
      } else if (themeNamespace && !theme) {
        throw new Error('Invalid themeNamespace use in react-css-themr. ' +
          'themeNamespace prop should be used only with theme prop.')
      } else {
        return Object.keys(theme)
          .filter(key => key.startsWith(themeNamespace))
          .reduce((result, key) => ({ ...result, [removeNamespace(key, themeNamespace)]: theme[ key ] }), {})
      }
    }

    getThemeNotComposed(props: P): TTheme {
      if (props.theme) return this.getNamespacedTheme(props)
      if (config.localTheme) return config.localTheme
      return this.getContextTheme()
    }

    getContextTheme(): TTheme {
      return this.context.themr
        ? this.context.themr.theme[config.componentName]
        : {}
    }

    getTheme(props: P): TTheme {
      return props.composeTheme === COMPOSE_SOFTLY
        ? {
          ...this.getContextTheme(),
          ...config.localTheme,
          ...this.getNamespacedTheme(props)
        }
        : themeable(
          themeable(this.getContextTheme(), config.localTheme),
          this.getNamespacedTheme(props)
        )
    }

    calcTheme(props: P): TTheme {
      const { composeTheme } = props
      return composeTheme
        ? this.getTheme(props)
        : this.getThemeNotComposed(props)
    }

    componentWillReceiveProps(nextProps: P) {
      if (
        nextProps.composeTheme !== this.props.composeTheme ||
        nextProps.theme !== this.props.theme ||
        nextProps.themeNamespace !== this.props.themeNamespace
      ) {
        this.theme_ = this.calcTheme(nextProps)
      }
    }

    render() {
      const map = this.props.mapThemrProps as TMapThemrProps<P>
      return React.createElement(
        Target as React.ComponentClass<P>,
        map(this.props, this.theme_)
      )
    }
  }

  Themed[THEMR_CONFIG] = config

  return hoistNonReactStatics(Themed, Target)
  }
}

export default themr

/**
 * Merges passed themes by concatenating string keys and processing nested themes
 *
 * @param themes - Themes
 * @returns Resulting theme
 */
export function themeable(...themes: TTheme[]) {
  return themes.reduce((acc, theme) => merge(acc, theme), {})
}

/**
 * @param {TReactCSSThemrTheme} [original] - Original theme
 * @param {TReactCSSThemrTheme} [mixin] - Mixin theme
 * @returns {TReactCSSThemrTheme} - resulting theme
 */
function merge(original: TTheme = {}, mixin: TTheme = {}): TTheme {
  //make a copy to avoid mutations of nested objects
  //also strip all functions injected by isomorphic-style-loader
  const result = Object.keys(original).reduce((acc, key) => {
    const value = original[key]
    if (typeof value !== 'function') {
      acc[key] = value
    }
    return acc
  }, {})

  //traverse mixin keys and merge them to resulting theme
  Object.keys(mixin).forEach(key => {
    //there's no need to set any defaults here
    const originalValue = result[key]
    const mixinValue = mixin[key]

    switch (typeof mixinValue) {
      case 'object': {
        //possibly nested theme object
        switch (typeof originalValue) {
          case 'object': {
            //exactly nested theme object - go recursive
            result[key] = merge(originalValue, mixinValue as TTheme)
            break
          }

          case 'undefined': {
            //original does not contain this nested key - just take it as is
            result[key] = mixinValue
            break
          }

          default: {
            //can't merge an object with a non-object
            throw new Error(`You are merging object ${key} with a non-object ${originalValue}`)
          }
        }
        break
      }

      case 'undefined': //fallthrough - handles accidentally unset values which may come from props
      case 'function': {
        //this handles issue when isomorphic-style-loader addes helper functions to css-module
        break //just skip
      }

      default: {
        //plain values
        switch (typeof originalValue) {
          case 'object': {
            //can't merge a non-object with an object
            throw new Error(`You are merging non-object ${mixinValue} with an object ${key}`)
          }

          case 'undefined': {
            //mixin key is new to original theme - take it as is
            result[key] = mixinValue
            break
          }
          case 'function': {
            //this handles issue when isomorphic-style-loader addes helper functions to css-module
            break //just skip
          }

          default: {
            //finally we can merge
            result[key] = (originalValue as string).split(' ')
              .concat((mixinValue as string).split(' '))
              .filter((item, pos, self) => self.indexOf(item) === pos && item !== '')
              .join(' ')
            break
          }
        }
        break
      }
    }
  })

  return result
}

/**
 * Validates compose option
 *
 * @param composeTheme - Compose them option
 * @throws
 */
function validateComposeOption(composeTheme: TComposeTheme): void {
  if ([ COMPOSE_DEEPLY, COMPOSE_SOFTLY, DONT_COMPOSE ].indexOf(composeTheme) === -1) {
    throw new Error(
      `Invalid composeTheme option for react-css-themr. Valid composition options\
 are ${COMPOSE_DEEPLY}, ${COMPOSE_SOFTLY} and ${DONT_COMPOSE}. The given\
 option was ${composeTheme}`
    )
  }
}

/**
 * Removes namespace from key
 *
 * @param key - Key
 * @param themeNamespace - Theme namespace
 * @returns Key
 */
function removeNamespace(key: string, themeNamespace: string): string {
  const capitalized = key.substr(themeNamespace.length)
  return capitalized.slice(0, 1).toLowerCase() + capitalized.slice(1)
}

/**
 * Maps props and theme to an object that will be used to pass down props to the
 * decorated component.
 *
 * @param {Object} ownProps - All props given to the decorated component
 * @param {Object} theme - Calculated then that should be passed down
 * @returns {Object} - Props that will be passed down to the decorated component
 */
function defaultMapThemrProps<T extends TTheme>(ownProps: any, theme: T): {theme: T} {
  const {
    composeTheme,   //eslint-disable-line no-unused-vars
    innerRef,
    themeNamespace, //eslint-disable-line no-unused-vars
    mapThemrProps,  //eslint-disable-line no-unused-vars
    ...rest
  } = ownProps

  return {
    ...rest,
    ref: innerRef,
    theme
  }
}
